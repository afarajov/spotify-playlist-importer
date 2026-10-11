import { SPOTIFY_TOKEN_URL } from '../../config/spotify.ts'
import type { AuthErrorCode } from '../../shared/types/index.ts'
import { describeRateLimit, SpotifyAuthError } from './errors.ts'

export type TokenSet = {
  accessToken: string
  refreshToken: string | null
  expiresIn: number
  scope: string
}

type TokenRequest = {
  body: URLSearchParams
  fetchImpl: typeof fetch
  failure: Extract<AuthErrorCode, 'token_exchange_failed' | 'refresh_failed'>
  requireRefreshToken: boolean
}

export function exchangeAuthorizationCode(input: {
  clientId: string
  code: string
  redirectUri: string
  codeVerifier: string
  fetchImpl: typeof fetch
}): Promise<TokenSet> {
  return requestToken({
    fetchImpl: input.fetchImpl,
    failure: 'token_exchange_failed',
    requireRefreshToken: true,
    body: new URLSearchParams({
      client_id: input.clientId,
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    }),
  })
}

export function refreshAccessToken(input: {
  clientId: string
  refreshToken: string
  fetchImpl: typeof fetch
}): Promise<TokenSet> {
  return requestToken({
    fetchImpl: input.fetchImpl,
    failure: 'refresh_failed',
    requireRefreshToken: false,
    body: new URLSearchParams({
      client_id: input.clientId,
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken,
    }),
  })
}

async function requestToken(input: TokenRequest): Promise<TokenSet> {
  let response: Response
  try {
    response = await input.fetchImpl(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: input.body,
    })
  } catch (error) {
    if (error instanceof SpotifyAuthError) {
      throw error
    }
    throw new SpotifyAuthError('network')
  }

  const body = await readJson(response)
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After'))
    throw new SpotifyAuthError(
      'rate_limited',
      describeRateLimit(Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : null, isQuotaExceeded(body)),
    )
  }
  if (isInvalidGrant(body)) {
    throw new SpotifyAuthError('invalid_grant')
  }
  if (!response.ok) {
    throw new SpotifyAuthError(input.failure)
  }
  return parseTokenSet(body, input.requireRefreshToken, input.failure)
}

function parseTokenSet(
  body: unknown,
  requireRefreshToken: boolean,
  failure: TokenRequest['failure'],
): TokenSet {
  if (!isRecord(body)) {
    throw new SpotifyAuthError(failure)
  }
  const accessToken = body.access_token
  const expiresIn = body.expires_in
  const refreshToken = body.refresh_token
  const tokenType = body.token_type
  const scope = body.scope
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new SpotifyAuthError(failure)
  }
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new SpotifyAuthError(failure)
  }
  if (tokenType !== undefined && tokenType !== 'Bearer') {
    throw new SpotifyAuthError(failure)
  }
  if (requireRefreshToken && (typeof refreshToken !== 'string' || refreshToken.length === 0)) {
    throw new SpotifyAuthError(failure)
  }
  if (refreshToken !== undefined && refreshToken !== null && typeof refreshToken !== 'string') {
    throw new SpotifyAuthError(failure)
  }
  return {
    accessToken,
    refreshToken: typeof refreshToken === 'string' && refreshToken.length > 0 ? refreshToken : null,
    expiresIn,
    scope: typeof scope === 'string' ? scope : '',
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function isInvalidGrant(body: unknown): boolean {
  return isRecord(body) && body.error === 'invalid_grant'
}

function isQuotaExceeded(body: unknown): boolean {
  return isRecord(body) && isRecord(body.error) && body.error.reason === 'QUOTA_EXCEEDED'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
