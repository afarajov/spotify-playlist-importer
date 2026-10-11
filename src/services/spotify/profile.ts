import type { SpotifyAccount } from '../../shared/types/index.ts'
import { SpotifyApiError, spotifyJson, type SpotifyTokenSource } from './client.ts'

export async function fetchCurrentAccount(
  tokenSource: SpotifyTokenSource,
  fetchImpl: typeof fetch = fetch,
): Promise<SpotifyAccount> {
  const body = await spotifyJson<unknown>({ path: '/me', tokenSource, fetchImpl })
  const account = parseSpotifyAccount(body)
  if (!account) {
    throw new SpotifyApiError({ kind: 'request_failed', code: 'profile_failed', status: 200 })
  }
  return account
}

export function parseSpotifyAccount(body: unknown): SpotifyAccount | null {
  if (!isRecord(body) || typeof body.account_id !== 'string' || body.account_id.length === 0) {
    return null
  }
  const displayName = typeof body.display_name === 'string' && body.display_name.trim().length > 0
    ? body.display_name.trim()
    : null
  return {
    accountId: body.account_id,
    displayName,
    imageUrl: largestHttpsImage(body.images),
    profileUrl: httpsUrl(isRecord(body.external_urls) ? body.external_urls.spotify : null),
  }
}

function largestHttpsImage(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null
  }
  let bestUrl: string | null = null
  let bestWidth = -1
  for (const image of value) {
    if (!isRecord(image)) {
      continue
    }
    const url = httpsUrl(image.url)
    if (!url) {
      continue
    }
    const width = typeof image.width === 'number' ? image.width : 0
    if (width >= bestWidth) {
      bestUrl = url
      bestWidth = width
    }
  }
  return bestUrl
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('https://')) {
    return null
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
