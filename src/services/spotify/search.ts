import { MATCHING } from '../../features/matching/config.ts'
import type { SpotifyTrack } from '../../features/matching/rank.ts'
import { SpotifyApiError, spotifyJson, type SpotifyTokenSource } from './client.ts'

export type SearchTracksInput = {
  query: string
  tokenSource: SpotifyTokenSource
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  limit?: number
  offset?: number
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>
}

export async function searchTracks(input: SearchTracksInput): Promise<SpotifyTrack[]> {
  try {
    return await requestTracks(input)
  } catch (error) {
    if (!(error instanceof SpotifyApiError) || error.kind !== 'rate_limited' || error.quotaExceeded) {
      throw error
    }
    const seconds = Math.min(error.retryAfterSeconds ?? 1, MATCHING.rateLimitRetryCapSeconds)
    await (input.wait ?? delay)(seconds * 1000, input.signal ?? new AbortController().signal)
    return requestTracks(input)
  }
}

async function requestTracks(input: SearchTracksInput): Promise<SpotifyTrack[]> {
  const params = new URLSearchParams({
    q: input.query,
    type: 'track',
    limit: String(clampLimit(input.limit ?? MATCHING.searchLimit)),
  })
  if (input.offset !== undefined && input.offset > 0) {
    params.set('offset', String(Math.floor(input.offset)))
  }
  const body = await spotifyJson<unknown>({
    path: `/search?${params.toString()}`,
    tokenSource: input.tokenSource,
    fetchImpl: input.fetchImpl,
    signal: input.signal,
  })
  return parseTrackSearch(body)
}

export function parseTrackSearch(body: unknown): SpotifyTrack[] {
  if (!isRecord(body) || !isRecord(body.tracks) || !Array.isArray(body.tracks.items)) {
    throw new SpotifyApiError({ kind: 'request_failed', code: 'profile_failed', status: null })
  }
  const tracks: SpotifyTrack[] = []
  for (const item of body.tracks.items) {
    const track = parseTrack(item)
    if (track) {
      tracks.push(track)
    }
  }
  return tracks
}

function parseTrack(value: unknown): SpotifyTrack | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0 || typeof value.name !== 'string') {
    return null
  }
  const artists = Array.isArray(value.artists)
    ? value.artists.flatMap((artist) => (isRecord(artist) && typeof artist.name === 'string' && artist.name.trim() ? [artist.name.trim()] : []))
    : []
  const album = isRecord(value.album) ? value.album : {}
  const restrictions = isRecord(value.restrictions) && typeof value.restrictions.reason === 'string'
  const playable = value.is_playable
  return {
    trackId: value.id,
    uri: typeof value.uri === 'string' && value.uri.startsWith('spotify:track:') ? value.uri : `spotify:track:${value.id}`,
    title: value.name,
    artists,
    albumName: typeof album.name === 'string' ? album.name : '',
    imageUrl: largestHttpsImage(album.images),
    externalUrl: httpsUrl(isRecord(value.external_urls) ? value.external_urls.spotify : null),
    durationMs: typeof value.duration_ms === 'number' && Number.isFinite(value.duration_ms) ? value.duration_ms : null,
    available: playable !== false && !restrictions,
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
  return typeof value === 'string' && value.startsWith('https://') ? value : null
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) {
    return MATCHING.searchLimit
  }
  return Math.min(MATCHING.searchLimit, Math.floor(limit))
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(abortError())
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(finish, milliseconds)
    signal.addEventListener('abort', cancel, { once: true })
    function finish() {
      signal.removeEventListener('abort', cancel)
      resolve()
    }
    function cancel() {
      clearTimeout(timer)
      reject(abortError())
    }
  })
}

function abortError(): Error {
  return new DOMException('The operation was aborted.', 'AbortError')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
