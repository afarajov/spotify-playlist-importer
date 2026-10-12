import { PLAYLIST_PAGE_SIZE, RATE_LIMIT_RETRY_CAP_SECONDS } from '../../features/import/limits.ts'
import type { EditablePlaylist, PlaylistEditability } from '../../shared/types/index.ts'
import { SpotifyApiError, spotifyJson, type SpotifyTokenSource } from './client.ts'

const PLAYLIST_ID = /^[0-9A-Za-z]+$/
const TRACK_URI = /^spotify:track:[0-9A-Za-z]+$/

export type PlaylistPage = {
  playlists: EditablePlaylist[]
  hiddenCount: number
  total: number | null
  nextOffset: number | null
}

export type CreatedPlaylist = {
  id: string
  name: string
  externalUrl: string | null
}

export type AddedPlaylistItems = {
  snapshotId: string
}

type SpotifyCall = {
  tokenSource: SpotifyTokenSource
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>
}

export async function listMyPlaylists(input: SpotifyCall & { offset?: number; ownerIds: readonly string[] }): Promise<PlaylistPage> {
  const offset = Math.max(0, Math.floor(input.offset ?? 0))
  const params = new URLSearchParams({
    limit: String(PLAYLIST_PAGE_SIZE),
    offset: String(offset),
  })
  const body = await withRateLimit(
    () =>
      spotifyJson<unknown>({
        path: `/me/playlists?${params.toString()}`,
        tokenSource: input.tokenSource,
        fetchImpl: input.fetchImpl,
        signal: input.signal,
      }),
    input,
  )
  return parsePlaylistPage(body, input.ownerIds, offset)
}

export function parsePlaylistPage(body: unknown, ownerIds: readonly string[], offset: number): PlaylistPage {
  if (!isRecord(body) || !Array.isArray(body.items)) {
    throw new SpotifyApiError({ kind: 'request_failed', code: 'profile_failed', status: null })
  }
  const playlists: EditablePlaylist[] = []
  let hiddenCount = 0
  for (const item of body.items) {
    const playlist = parsePlaylist(item, ownerIds)
    if (playlist === 'hide') {
      hiddenCount += 1
      continue
    }
    if (playlist) {
      playlists.push(playlist)
    }
  }
  const total = typeof body.total === 'number' && Number.isFinite(body.total) ? body.total : null
  const consumed = offset + body.items.length
  const nextOffset = body.next && (total === null || consumed < total) ? consumed : null
  return { playlists, hiddenCount, total, nextOffset }
}

export async function createPlaylist(
  input: SpotifyCall & { name: string; description: string; isPublic: boolean },
): Promise<CreatedPlaylist> {
  const body = await withRateLimit(
    () =>
      spotifyJson<unknown>({
        path: '/me/playlists',
        method: 'POST',
        tokenSource: input.tokenSource,
        fetchImpl: input.fetchImpl,
        signal: input.signal,
        body: {
          name: input.name,
          public: input.isPublic,
          ...(input.description.length > 0 ? { description: input.description } : {}),
        },
      }),
    input,
  )
  if (!isRecord(body) || typeof body.id !== 'string' || !PLAYLIST_ID.test(body.id)) {
    throw new SpotifyApiError({ kind: 'request_failed', code: 'profile_failed', status: null })
  }
  return {
    id: body.id,
    name: typeof body.name === 'string' && body.name.trim() ? body.name : input.name,
    externalUrl: httpsUrl(isRecord(body.external_urls) ? body.external_urls.spotify : null),
  }
}

export async function addPlaylistItems(input: SpotifyCall & { playlistId: string; uris: readonly string[] }): Promise<AddedPlaylistItems> {
  const playlistId = requirePlaylistId(input.playlistId)
  if (input.uris.length === 0 || input.uris.length > 100) {
    throw new SpotifyApiError({ kind: 'request_failed', code: 'profile_failed', status: null })
  }
  if (input.uris.some((uri) => !TRACK_URI.test(uri))) {
    throw new SpotifyApiError({ kind: 'request_failed', code: 'profile_failed', status: null })
  }
  const body = await withRateLimit(
    () =>
      spotifyJson<unknown>({
        path: `/playlists/${playlistId}/items`,
        method: 'POST',
        tokenSource: input.tokenSource,
        fetchImpl: input.fetchImpl,
        signal: input.signal,
        body: { uris: [...input.uris] },
      }),
    input,
  )
  if (!isRecord(body) || typeof body.snapshot_id !== 'string' || body.snapshot_id.length === 0) {
    throw new SpotifyApiError({ kind: 'request_failed', code: 'profile_failed', status: null })
  }
  return { snapshotId: body.snapshot_id }
}

export async function listPlaylistTrackUris(input: SpotifyCall & { playlistId: string }): Promise<string[]> {
  const playlistId = requirePlaylistId(input.playlistId)
  const uris: string[] = []
  let offset = 0
  let pages = 0
  while (pages < 400) {
    pages += 1
    const page = await withRateLimit(
      () =>
        spotifyJson<unknown>({
          path: `/playlists/${playlistId}/items?${new URLSearchParams({
            limit: String(PLAYLIST_PAGE_SIZE),
            offset: String(offset),
          }).toString()}`,
          tokenSource: input.tokenSource,
          fetchImpl: input.fetchImpl,
          signal: input.signal,
        }),
      input,
    )
    const parsed = parsePlaylistItems(page)
    uris.push(...parsed.uris)
    if (parsed.received === 0 || parsed.received < PLAYLIST_PAGE_SIZE) {
      return uris
    }
    offset += parsed.received
    if (parsed.total !== null && offset >= parsed.total) {
      return uris
    }
  }
  throw new SpotifyApiError({ kind: 'request_failed', code: 'profile_failed', status: null })
}

export function parsePlaylistItems(body: unknown): { uris: string[]; total: number | null; received: number } {
  if (!isRecord(body) || !Array.isArray(body.items)) {
    throw new SpotifyApiError({ kind: 'request_failed', code: 'profile_failed', status: null })
  }
  const uris: string[] = []
  for (const entry of body.items) {
    const uri = readItemUri(entry)
    if (uri) {
      uris.push(uri)
    }
  }
  return {
    uris,
    total: typeof body.total === 'number' && Number.isFinite(body.total) ? body.total : null,
    received: body.items.length,
  }
}

function parsePlaylist(value: unknown, ownerIds: readonly string[]): EditablePlaylist | 'hide' | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !PLAYLIST_ID.test(value.id) || typeof value.name !== 'string' || !value.name.trim()) {
    return null
  }
  const owner = isRecord(value.owner) ? value.owner : {}
  const playlistOwnerIds = ownerIdentifiers(owner)
  const collaborative = value.collaborative === true
  const editability = editabilityFor(playlistOwnerIds, ownerIds, collaborative)
  if (!editability) {
    return 'hide'
  }
  const images = Array.isArray(value.images) ? value.images : []
  return {
    id: value.id,
    name: value.name.trim(),
    description: typeof value.description === 'string' ? value.description : '',
    visibility: value.public === true ? 'public' : value.public === false ? 'private' : null,
    trackCount: readTrackCount(value),
    ownerName: typeof owner.display_name === 'string' && owner.display_name.trim() ? owner.display_name.trim() : playlistOwnerIds[0] ?? '',
    ownerId: playlistOwnerIds[0] ?? '',
    canModify: editability === 'likely',
    editability,
    collaborative,
    imageUrl: largestHttpsImage(images),
    externalUrl: httpsUrl(isRecord(value.external_urls) ? value.external_urls.spotify : null),
  }
}

function ownerIdentifiers(owner: Record<string, unknown>): string[] {
  const ids: string[] = []
  if (typeof owner.account_id === 'string' && owner.account_id.length > 0) {
    ids.push(owner.account_id)
  }
  if (typeof owner.id === 'string' && owner.id.length > 0) {
    ids.push(owner.id)
  }
  if (typeof owner.uri === 'string') {
    const match = /^spotify:user:(.+)$/.exec(owner.uri)
    if (match?.[1]) {
      ids.push(decodeURIComponent(match[1]))
    }
  }
  return ids
}

function editabilityFor(
  playlistOwnerIds: readonly string[],
  currentUserIds: readonly string[],
  collaborative: boolean,
): PlaylistEditability | null {
  const current = new Set(currentUserIds.filter((id) => id.length > 0))
  if (current.size === 0 || playlistOwnerIds.length === 0) {
    return collaborative ? 'unconfirmed' : null
  }
  if (playlistOwnerIds.some((id) => current.has(id))) {
    return 'likely'
  }
  return collaborative ? 'unconfirmed' : null
}

function readTrackCount(value: Record<string, unknown>): number | null {
  const items = isRecord(value.items) ? value.items.total : undefined
  const tracks = isRecord(value.tracks) ? value.tracks.total : undefined
  const total = typeof items === 'number' ? items : tracks
  return typeof total === 'number' && Number.isFinite(total) && total >= 0 ? total : null
}

function readItemUri(entry: unknown): string | null {
  if (!isRecord(entry)) {
    return null
  }
  const candidates = [entry.item, entry.track]
  for (const candidate of candidates) {
    if (!isRecord(candidate) || candidate.type === 'episode') {
      continue
    }
    if (typeof candidate.uri === 'string' && TRACK_URI.test(candidate.uri)) {
      return candidate.uri
    }
  }
  return null
}

function requirePlaylistId(playlistId: string): string {
  if (!PLAYLIST_ID.test(playlistId)) {
    throw new SpotifyApiError({ kind: 'request_failed', code: 'profile_failed', status: null })
  }
  return playlistId
}

async function withRateLimit<T>(request: () => Promise<T>, input: SpotifyCall): Promise<T> {
  try {
    return await request()
  } catch (error) {
    if (!(error instanceof SpotifyApiError) || error.kind !== 'rate_limited' || error.quotaExceeded) {
      throw error
    }
    const seconds = Math.min(error.retryAfterSeconds ?? 1, RATE_LIMIT_RETRY_CAP_SECONDS)
    await (input.wait ?? delay)(seconds * 1000, input.signal ?? new AbortController().signal)
    return request()
  }
}

function largestHttpsImage(images: unknown[]): string | null {
  let best: { url: string; width: number } | null = null
  for (const image of images) {
    if (!isRecord(image) || typeof image.url !== 'string' || !image.url.startsWith('https://')) {
      continue
    }
    const width = typeof image.width === 'number' ? image.width : 0
    if (!best || width > best.width) {
      best = { url: image.url, width }
    }
  }
  return best?.url ?? null
}

function httpsUrl(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('https://') ? value : null
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      },
      { once: true },
    )
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
