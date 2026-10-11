import { describe, expect, it, vi } from 'vitest'
import { addSixMonths } from '../../config/spotify.ts'
import type { SpotifyAccount } from '../../shared/types/index.ts'
import { AUTH_SESSION_STORAGE_KEY, createMemoryStorage, PKCE_STORAGE_KEY, type KeyValueStorage } from './storage.ts'
import { SpotifySession, type BrowserLocation } from './session.ts'

const NOW = Date.UTC(2026, 5, 1, 12)
const REDIRECT_URI = 'http://127.0.0.1:5173/callback'

type Harness = {
  session: SpotifySession
  storage: KeyValueStorage
  location: BrowserLocation & { assigned: string }
  fetchImpl: ReturnType<typeof vi.fn>
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function createLocation(pathname = '/', search = ''): BrowserLocation & { assigned: string } {
  const location = {
    pathname,
    search,
    assigned: '',
    assign(url: string) {
      location.assigned = url
    },
    replacePath(path: string) {
      location.pathname = path
      location.search = ''
    },
  }
  return location
}

function createHarness(options?: {
  config?: { clientId: string; redirectUri: string }
  fetchImpl?: typeof fetch
  pathname?: string
  search?: string
}): Harness {
  const storage = createMemoryStorage()
  const location = createLocation(options?.pathname, options?.search)
  const fetchImpl = vi.fn(options?.fetchImpl ?? (async () => {
    throw new Error('unexpected fetch')
  }))
  const session = new SpotifySession({
    config: options?.config ?? { clientId: 'client-id', redirectUri: REDIRECT_URI },
    storage,
    fetchImpl: fetchImpl as typeof fetch,
    now: () => NOW,
    location,
    randomBytes: (length) => new Uint8Array(length).fill(7),
  })
  return { session, storage, location, fetchImpl }
}

function tokenBody(overrides?: Record<string, unknown>) {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'user-read-private playlist-read-private',
    ...overrides,
  }
}

function profileBody(overrides?: Record<string, unknown>) {
  return {
    account_id: 'acct_1',
    display_name: 'Ada Lovelace',
    email: 'ada@example.com',
    images: [{ url: 'https://i.scdn.co/image/ada', width: 64, height: 64 }],
    external_urls: { spotify: 'https://open.spotify.com/user/ada' },
    ...overrides,
  }
}

function seedSession(storage: KeyValueStorage, overrides?: Record<string, unknown>) {
  storage.set(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      accessTokenExpiresAt: NOW + 3_600_000,
      refreshTokenExpiresAt: addSixMonths(NOW),
      scope: 'user-read-private',
      account: null,
      ...overrides,
    }),
  )
}

async function startAndReturn(harness: Harness, search: string) {
  await harness.session.connect()
  harness.location.pathname = '/callback'
  harness.location.search = search
  const stored = JSON.parse(harness.storage.get(PKCE_STORAGE_KEY) ?? '{}') as { state?: string }
  return { state: stored.state ?? '' }
}

describe('Spotify session', () => {
  it('refuses to start authorization when configuration is missing', async () => {
    const harness = createHarness({ config: { clientId: '', redirectUri: '' } })

    await harness.session.connect()

    expect(harness.location.assigned).toBe('')
    expect(harness.session.getSnapshot()).toMatchObject({
      status: 'signed_out',
      isConfigured: false,
      error: { code: 'missing_configuration' },
    })
    expect(harness.session.getSnapshot().configurationMessage).toContain('VITE_SPOTIFY_CLIENT_ID')
    expect(harness.storage.get(PKCE_STORAGE_KEY)).toBeNull()
  })

  it('redirects with a PKCE challenge and stores the verifier outside the URL', async () => {
    const harness = createHarness()

    await harness.session.connect()

    const url = new URL(harness.location.assigned)
    const stored = JSON.parse(harness.storage.get(PKCE_STORAGE_KEY) ?? '{}') as { verifier: string; state: string }
    expect(harness.session.getSnapshot().status).toBe('redirecting')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(url.searchParams.get('state')).toBe(stored.state)
    expect(url.searchParams.has('client_secret')).toBe(false)
    expect(url.toString()).not.toContain(stored.verifier)
    expect(url.toString()).not.toContain('code_verifier')
  })

  it('exchanges a valid callback, then loads the profile without storing extra personal data', async () => {
    const harness = createHarness({
      fetchImpl: async (input, init) => {
        const url = String(input)
        if (url.endsWith('/api/token')) {
          expect(harness.location.pathname).toBe('/')
          expect(harness.storage.get(PKCE_STORAGE_KEY)).toBeNull()
          const body = init?.body instanceof URLSearchParams ? init.body.toString() : ''
          expect(body).toContain('grant_type=authorization_code')
          expect(body).toContain('code=auth-code')
          expect(body).toContain(`redirect_uri=${encodeURIComponent(REDIRECT_URI)}`)
          expect(body).toContain('code_verifier=')
          expect(body).not.toContain('client_secret')
          return jsonResponse(tokenBody())
        }
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access-token')
        return jsonResponse(profileBody())
      },
    })
    const { state } = await startAndReturn(harness, '')
    harness.location.pathname = '/callback/'
    harness.location.search = `?code=auth-code&state=${state}`

    await harness.session.handleCallbackIfPresent()

    const account: SpotifyAccount = {
      accountId: 'acct_1',
      displayName: 'Ada Lovelace',
      imageUrl: 'https://i.scdn.co/image/ada',
      profileUrl: 'https://open.spotify.com/user/ada',
    }
    expect(harness.session.getSnapshot()).toMatchObject({ status: 'signed_in', account, error: null })
    expect(harness.storage.get(AUTH_SESSION_STORAGE_KEY)).not.toContain('ada@example.com')
    expect(harness.location.pathname).toBe('/')
  })

  it('processes one callback once', async () => {
    let tokenCalls = 0
    const harness = createHarness({
      fetchImpl: async (input) => {
        if (String(input).endsWith('/api/token')) {
          tokenCalls += 1
          return jsonResponse(tokenBody())
        }
        return jsonResponse(profileBody())
      },
    })
    const { state } = await startAndReturn(harness, '')
    harness.location.pathname = '/callback'
    harness.location.search = `?code=auth-code&state=${state}`

    const first = harness.session.handleCallbackIfPresent()
    const second = harness.session.handleCallbackIfPresent()

    expect(first).toBe(second)
    await first
    expect(tokenCalls).toBe(1)
  })

  it('rejects a mismatched state before exchanging the code', async () => {
    const harness = createHarness()
    const { state } = await startAndReturn(harness, '')
    harness.location.pathname = '/callback'
    harness.location.search = `?code=auth-code&state=${'x'.repeat(state.length)}`

    await harness.session.handleCallbackIfPresent()

    expect(harness.fetchImpl).not.toHaveBeenCalled()
    expect(harness.session.getSnapshot().error?.code).toBe('invalid_state')
  })

  it('reports a missing code, a denial, a missing verifier, and an expired verifier', async () => {
    const missingCode = createHarness()
    const started = await startAndReturn(missingCode, '')
    missingCode.location.pathname = '/callback'
    missingCode.location.search = `?state=${started.state}`
    await missingCode.session.handleCallbackIfPresent()
    expect(missingCode.fetchImpl).not.toHaveBeenCalled()
    expect(missingCode.session.getSnapshot().error?.code).toBe('missing_code')

    const denied = createHarness()
    const deniedStart = await startAndReturn(denied, '')
    denied.location.pathname = '/callback'
    denied.location.search = `?error=access_denied&state=${deniedStart.state}`
    await denied.session.handleCallbackIfPresent()
    expect(denied.fetchImpl).not.toHaveBeenCalled()
    expect(denied.session.getSnapshot().error).toMatchObject({
      code: 'access_denied',
      message: expect.stringContaining('declined'),
    })

    const missingVerifier = createHarness({ pathname: '/callback', search: '?code=auth-code&state=abc' })
    await missingVerifier.session.handleCallbackIfPresent()
    expect(missingVerifier.session.getSnapshot().error?.code).toBe('missing_verifier')

    const expired = createHarness()
    await expired.session.connect()
    const stored = JSON.parse(expired.storage.get(PKCE_STORAGE_KEY) ?? '{}') as { state: string; verifier: string }
    expired.storage.set(
      PKCE_STORAGE_KEY,
      JSON.stringify({ ...stored, createdAt: NOW - 11 * 60 * 1000 }),
    )
    expired.location.pathname = '/callback'
    expired.location.search = `?code=auth-code&state=${stored.state}`
    await expired.session.handleCallbackIfPresent()
    expect(expired.fetchImpl).not.toHaveBeenCalled()
    expect(expired.session.getSnapshot().error?.code).toBe('expired_verifier')
  })

  it('keeps token-exchange failures free of credential details', async () => {
    const harness = createHarness({
      fetchImpl: async () => jsonResponse({ error: 'invalid_request', error_description: 'bad secret value' }, 400),
    })
    const { state } = await startAndReturn(harness, '')
    harness.location.pathname = '/callback'
    harness.location.search = `?code=auth-code&state=${state}`

    await harness.session.handleCallbackIfPresent()

    expect(harness.session.getSnapshot().error?.code).toBe('token_exchange_failed')
    expect(harness.session.getSnapshot().error?.message).not.toContain('secret')
    expect(harness.storage.get(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })

  it('returns a current access token and refreshes one that is near expiry', async () => {
    const fresh = createHarness()
    seedSession(fresh.storage)
    const current = new SpotifySession({
      config: { clientId: 'client-id', redirectUri: REDIRECT_URI },
      storage: fresh.storage,
      fetchImpl: fresh.fetchImpl as typeof fetch,
      now: () => NOW,
      location: fresh.location,
    })
    await expect(current.getValidAccessToken()).resolves.toBe('old-access')
    expect(fresh.fetchImpl).not.toHaveBeenCalled()

    const expiring = createHarness({
      fetchImpl: async (_input, init) => {
        const body = init?.body instanceof URLSearchParams ? init.body.toString() : ''
        expect(body).toContain('grant_type=refresh_token')
        expect(body).toContain('refresh_token=old-refresh')
        expect(body).not.toContain('client_secret')
        return jsonResponse(tokenBody({ access_token: 'new-access', refresh_token: 'rotated-refresh' }))
      },
    })
    seedSession(expiring.storage, { accessTokenExpiresAt: NOW + 30_000 })
    const refreshing = new SpotifySession({
      config: { clientId: 'client-id', redirectUri: REDIRECT_URI },
      storage: expiring.storage,
      fetchImpl: expiring.fetchImpl as typeof fetch,
      now: () => NOW,
      location: expiring.location,
    })

    await expect(refreshing.getValidAccessToken()).resolves.toBe('new-access')
    const stored = JSON.parse(expiring.storage.get(AUTH_SESSION_STORAGE_KEY) ?? '{}') as {
      refreshToken: string
      refreshTokenExpiresAt: number
    }
    expect(stored.refreshToken).toBe('rotated-refresh')
    expect(stored.refreshTokenExpiresAt).toBe(addSixMonths(NOW))
  })

  it('keeps the previous refresh token when Spotify omits a replacement', async () => {
    const harness = createHarness({
      fetchImpl: async () => jsonResponse(tokenBody({ access_token: 'new-access', refresh_token: undefined })),
    })
    seedSession(harness.storage, { accessTokenExpiresAt: NOW })
    const session = new SpotifySession({
      config: { clientId: 'client-id', redirectUri: REDIRECT_URI },
      storage: harness.storage,
      fetchImpl: harness.fetchImpl as typeof fetch,
      now: () => NOW,
      location: harness.location,
    })

    await session.getValidAccessToken()

    const stored = JSON.parse(harness.storage.get(AUTH_SESSION_STORAGE_KEY) ?? '{}') as { refreshToken: string }
    expect(stored.refreshToken).toBe('old-refresh')
  })

  it('clears the session when refresh authorization is no longer valid', async () => {
    const harness = createHarness({
      fetchImpl: async () => jsonResponse({ error: 'invalid_grant', error_description: 'Refresh token revoked' }, 400),
    })
    seedSession(harness.storage, { accessTokenExpiresAt: NOW })
    const session = new SpotifySession({
      config: { clientId: 'client-id', redirectUri: REDIRECT_URI },
      storage: harness.storage,
      fetchImpl: harness.fetchImpl as typeof fetch,
      now: () => NOW,
      location: harness.location,
    })

    await expect(session.getValidAccessToken()).rejects.toMatchObject({ code: 'session_expired' })
    expect(harness.storage.get(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    expect(session.getSnapshot().error?.message).not.toContain('revoked')
  })

  it('keeps stored credentials when a refresh request fails temporarily', async () => {
    const harness = createHarness({
      fetchImpl: async () => jsonResponse({ error: 'server_error' }, 500),
    })
    seedSession(harness.storage, { accessTokenExpiresAt: NOW })
    const session = new SpotifySession({
      config: { clientId: 'client-id', redirectUri: REDIRECT_URI },
      storage: harness.storage,
      fetchImpl: harness.fetchImpl as typeof fetch,
      now: () => NOW,
      location: harness.location,
    })

    await expect(session.getValidAccessToken()).rejects.toMatchObject({ code: 'refresh_failed' })
    expect(JSON.parse(harness.storage.get(AUTH_SESSION_STORAGE_KEY) ?? '{}')).toMatchObject({
      refreshToken: 'old-refresh',
    })
  })

  it('asks for a new connection when the local refresh lifetime has ended', async () => {
    const storage = createMemoryStorage()
    seedSession(storage, { refreshTokenExpiresAt: NOW - 1 })
    const fetchImpl = vi.fn(async () => jsonResponse(tokenBody()))
    const session = new SpotifySession({
      config: { clientId: 'client-id', redirectUri: REDIRECT_URI },
      storage,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
      location: createLocation(),
    })

    expect(session.getSnapshot().status).toBe('signed_out')
    expect(session.getSnapshot().error?.code).toBe('session_expired')
    await expect(session.getValidAccessToken()).rejects.toMatchObject({ code: 'session_expired' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('shares one refresh request between concurrent callers', async () => {
    let release: (response: Response) => void = () => {}
    let calls = 0
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          calls += 1
          release = resolve
        }),
    )
    const storage = createMemoryStorage()
    seedSession(storage, { accessTokenExpiresAt: NOW })
    const session = new SpotifySession({
      config: { clientId: 'client-id', redirectUri: REDIRECT_URI },
      storage,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
      location: createLocation(),
    })

    const first = session.getValidAccessToken()
    const second = session.getValidAccessToken()
    expect(calls).toBe(1)
    release(jsonResponse(tokenBody({ access_token: 'shared-access', refresh_token: undefined })))

    await expect(Promise.all([first, second])).resolves.toEqual(['shared-access', 'shared-access'])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('keeps stored credentials when Spotify cannot be reached', async () => {
    const harness = createHarness({
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    seedSession(harness.storage, { accessTokenExpiresAt: NOW })
    const session = new SpotifySession({
      config: { clientId: 'client-id', redirectUri: REDIRECT_URI },
      storage: harness.storage,
      fetchImpl: harness.fetchImpl as typeof fetch,
      now: () => NOW,
      location: harness.location,
    })

    await expect(session.getValidAccessToken()).rejects.toMatchObject({ code: 'network' })
    expect(JSON.parse(harness.storage.get(AUTH_SESSION_STORAGE_KEY) ?? '{}')).toMatchObject({
      refreshToken: 'old-refresh',
    })
    expect(session.getSnapshot().error?.message).toContain('Could not reach Spotify')
  })

  it('rejects a missing session without calling Spotify', async () => {
    const harness = createHarness()

    await expect(harness.session.getValidAccessToken()).rejects.toMatchObject({ code: 'session_expired' })
    expect(harness.fetchImpl).not.toHaveBeenCalled()
  })

  it('disconnects the local session only', async () => {
    const harness = createHarness()
    seedSession(harness.storage, {
      account: {
        accountId: 'acct_1',
        displayName: 'Ada Lovelace',
        imageUrl: null,
        profileUrl: null,
      },
    })
    harness.storage.set('spotify-playlist-importer.song-draft', '{"mode":"manual","text":"keep","updatedAt":1}')
    const session = new SpotifySession({
      config: { clientId: 'client-id', redirectUri: REDIRECT_URI },
      storage: harness.storage,
      fetchImpl: harness.fetchImpl as typeof fetch,
      now: () => NOW,
      location: harness.location,
    })

    session.disconnect()

    expect(session.getSnapshot()).toMatchObject({ status: 'signed_out', account: null, error: null })
    expect(harness.storage.get(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    expect(harness.storage.get('spotify-playlist-importer.song-draft')).toContain('keep')
  })

  it('explains a Development Mode profile refusal without exposing the API body', async () => {
    const harness = createHarness({
      fetchImpl: async (input) => {
        if (String(input).endsWith('/api/token')) {
          return jsonResponse(tokenBody())
        }
        return jsonResponse({ error: { status: 403, message: 'User not registered in the Developer Dashboard' } }, 403)
      },
    })
    const { state } = await startAndReturn(harness, '')
    harness.location.pathname = '/callback'
    harness.location.search = `?code=auth-code&state=${state}`

    await harness.session.handleCallbackIfPresent()

    expect(harness.session.getSnapshot().status).toBe('signed_in')
    expect(harness.session.getSnapshot().error?.message).toContain('Users Management')
    expect(harness.session.getSnapshot().error?.message).not.toContain('not registered')
  })
})
