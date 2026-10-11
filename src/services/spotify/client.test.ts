import { describe, expect, it, vi } from 'vitest'
import { SpotifyApiError, spotifyJson } from './client.ts'

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('Spotify API client', () => {
  it('invokes fetch with the global receiver', async () => {
    const seen = { usesGlobalReceiver: false }
    const fetchImpl = async function (this: unknown) {
      seen.usesGlobalReceiver = this === globalThis
      return jsonResponse({ account_id: 'acct' })
    }

    await spotifyJson({
      path: '/me',
      tokenSource: { getValidAccessToken: async () => 'access-token', forceRefreshAccessToken: async () => 'unused' },
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(seen.usesGlobalReceiver).toBe(true)
  })

  it('sends one authorized request and returns JSON', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.spotify.com/v1/me')
      expect(String(input)).not.toContain('access-token')
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access-token')
      return jsonResponse({ account_id: 'acct' })
    })

    await expect(
      spotifyJson({
        path: '/me',
        tokenSource: { getValidAccessToken: async () => 'access-token', forceRefreshAccessToken: async () => 'unused' },
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toEqual({ account_id: 'acct' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('refreshes once after a 401 and retries with the new token', async () => {
    const tokens = ['expired-token', 'fresh-token']
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get('Authorization')
      if (authorization === 'Bearer expired-token') {
        return jsonResponse({ error: { status: 401, message: 'The access token expired' } }, 401)
      }
      return jsonResponse({ ok: true })
    })

    await expect(
      spotifyJson({
        path: '/me',
        tokenSource: {
          getValidAccessToken: async () => tokens[0] ?? '',
          forceRefreshAccessToken: async () => tokens[1] ?? '',
        },
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(new Headers(fetchImpl.mock.calls[1]?.[1]?.headers).get('Authorization')).toBe('Bearer fresh-token')
  })

  it('does not loop on a second 401', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { status: 401, message: 'nope' } }, 401))

    await expect(
      spotifyJson({
        path: '/me',
        tokenSource: {
          getValidAccessToken: async () => 'old',
          forceRefreshAccessToken: async () => 'still-old',
        },
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toMatchObject({ kind: 'unauthorized', status: 401 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('reports Development Mode, permission, quota, and rate-limit failures', async () => {
    const forbidden = spotifyJson({
      path: '/me',
      tokenSource: { getValidAccessToken: async () => 'token', forceRefreshAccessToken: async () => 'token' },
      fetchImpl: (async () =>
        jsonResponse({ error: { status: 403, message: 'User not registered in the Developer Dashboard' } }, 403)) as typeof fetch,
    })
    await expect(forbidden).rejects.toMatchObject({ kind: 'forbidden', developmentMode: true })

    const permission = spotifyJson({
      path: '/me',
      tokenSource: { getValidAccessToken: async () => 'token', forceRefreshAccessToken: async () => 'token' },
      fetchImpl: (async () => jsonResponse({ error: { status: 403, message: 'Forbidden' } }, 403)) as typeof fetch,
    })
    await expect(permission).rejects.toMatchObject({ developmentMode: false })

    const quota = spotifyJson({
      path: '/me',
      tokenSource: { getValidAccessToken: async () => 'token', forceRefreshAccessToken: async () => 'token' },
      fetchImpl: (async () =>
        jsonResponse({ error: { status: 429, message: 'quota', reason: 'QUOTA_EXCEEDED' } }, 429, {
          'Retry-After': '30',
        })) as typeof fetch,
    })
    await expect(quota).rejects.toMatchObject({ kind: 'rate_limited', quotaExceeded: true, retryAfterSeconds: 30 })
  })

  it('turns a network failure into a typed error and rejects protocol-relative paths', async () => {
    await expect(
      spotifyJson({
        path: '/me',
        tokenSource: { getValidAccessToken: async () => 'token', forceRefreshAccessToken: async () => 'token' },
        fetchImpl: (async () => {
          throw new TypeError('Failed to fetch')
        }) as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(SpotifyApiError)

    await expect(
      spotifyJson({
        path: '//evil.example',
        tokenSource: { getValidAccessToken: async () => 'token', forceRefreshAccessToken: async () => 'token' },
        fetchImpl: vi.fn() as typeof fetch,
      }),
    ).rejects.toMatchObject({ kind: 'request_failed' })
  })
})
