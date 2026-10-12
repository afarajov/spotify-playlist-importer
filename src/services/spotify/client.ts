import { SPOTIFY_API_BASE_URL } from '../../config/spotify.ts'
import type { AuthErrorCode } from '../../shared/types/index.ts'
import { SpotifyAuthError } from '../../features/auth/errors.ts'

export type SpotifyApiErrorKind = 'unauthorized' | 'forbidden' | 'rate_limited' | 'network' | 'request_failed'

export class SpotifyApiError extends Error {
  readonly kind: SpotifyApiErrorKind
  readonly status: number | null
  readonly retryAfterSeconds: number | null
  readonly developmentMode: boolean
  readonly quotaExceeded: boolean

  constructor(input: {
    kind: SpotifyApiErrorKind
    code: AuthErrorCode
    status?: number | null
    retryAfterSeconds?: number | null
    developmentMode?: boolean
    quotaExceeded?: boolean
  }) {
    super(input.code)
    this.name = 'SpotifyApiError'
    this.kind = input.kind
    this.status = input.status ?? null
    this.retryAfterSeconds = input.retryAfterSeconds ?? null
    this.developmentMode = input.developmentMode ?? false
    this.quotaExceeded = input.quotaExceeded ?? false
  }
}

export type SpotifyTokenSource = {
  getValidAccessToken(): Promise<string>
  forceRefreshAccessToken(): Promise<string>
}

type SpotifyJsonRequest = {
  path: string
  tokenSource: SpotifyTokenSource
  fetchImpl?: typeof fetch
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

export async function spotifyJson<T>(request: SpotifyJsonRequest): Promise<T> {
  const fetchImpl = request.fetchImpl ?? fetch
  const path = normalizeApiPath(request.path)
  const token = await request.tokenSource.getValidAccessToken()
  const first = await send(fetchImpl, path, token, request)
  if (first.response.status !== 401) {
    return parseSuccess<T>(first.response, first.body)
  }
  const refreshed = await request.tokenSource.forceRefreshAccessToken()
  const second = await send(fetchImpl, path, refreshed, request)
  return parseSuccess<T>(second.response, second.body)
}

function normalizeApiPath(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
    throw new SpotifyApiError({ kind: 'request_failed', code: 'unauthorized', status: null })
  }
  return path
}

async function send(
  fetchImpl: typeof fetch,
  path: string,
  accessToken: string,
  request: SpotifyJsonRequest,
): Promise<{ response: Response; body: unknown }> {
  let response: Response
  try {
    response = await fetchImpl.call(globalThis, `${SPOTIFY_API_BASE_URL}${path}`, {
      method: request.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: request.signal,
    })
  } catch (error) {
    if (isAbortError(error) || error instanceof SpotifyAuthError || error instanceof SpotifyApiError) {
      throw error
    }
    throw new SpotifyApiError({ kind: 'network', code: 'network' })
  }
  const body = await readJson(response)
  return { response, body }
}

function parseSuccess<T>(response: Response, body: unknown): T {
  if (response.ok) {
    return body as T
  }
  if (response.status === 401) {
    throw new SpotifyApiError({ kind: 'unauthorized', code: 'unauthorized', status: 401 })
  }
  if (response.status === 403) {
    throw new SpotifyApiError({
      kind: 'forbidden',
      code: 'forbidden',
      status: 403,
      developmentMode: isDevelopmentModeBody(body),
    })
  }
  if (response.status === 429) {
    throw new SpotifyApiError({
      kind: 'rate_limited',
      code: 'rate_limited',
      status: 429,
      retryAfterSeconds: readRetryAfter(response),
      quotaExceeded: isQuotaExceeded(body),
    })
  }
  throw new SpotifyApiError({ kind: 'request_failed', code: 'profile_failed', status: response.status })
}

function isDevelopmentModeBody(body: unknown): boolean {
  const message = readApiMessage(body).toLowerCase()
  return message.includes('not registered') || message.includes('allowlist') || message.includes('allow list')
}

function isQuotaExceeded(body: unknown): boolean {
  return isRecord(body) && isRecord(body.error) && body.error.reason === 'QUOTA_EXCEEDED'
}

function readApiMessage(body: unknown): string {
  if (!isRecord(body) || !isRecord(body.error) || typeof body.error.message !== 'string') {
    return ''
  }
  return body.error.message
}

function readRetryAfter(response: Response): number | null {
  const value = Number(response.headers.get('Retry-After'))
  return Number.isFinite(value) && value >= 0 ? value : null
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
