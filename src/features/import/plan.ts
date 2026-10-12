import { importReadyTracks } from '../matching/ready.ts'
import type { SongEntry, TrackMatch } from '../../shared/types/index.ts'
import { IMPORT_BATCH_SIZE, PLAYLIST_DESCRIPTION_MAX, PLAYLIST_NAME_MAX } from './limits.ts'

export type DuplicatePolicy = 'skip_existing' | 'allow_duplicates'

export type PlannedTrack = {
  songId: string
  position: number
  trackId: string
  uri: string
}

export type ImportPlan = {
  ready: PlannedTrack[]
  tracks: PlannedTrack[]
  skippedExisting: PlannedTrack[]
  batches: PlannedTrack[][]
  blocked: boolean
}

export type PlaylistDraft = {
  name: string
  description: string
  visibility: 'public' | 'private'
}

export function validateNewPlaylist(input: { name: string; description: string; visibility: string }): { ok: true; draft: PlaylistDraft } | { ok: false; message: string } {
  const name = input.name.trim()
  const description = input.description.trim()
  if (!name) {
    return { ok: false, message: 'Enter a playlist name.' }
  }
  if (name.length > PLAYLIST_NAME_MAX) {
    return { ok: false, message: `Use a playlist name of ${PLAYLIST_NAME_MAX} characters or fewer.` }
  }
  if (description.length > PLAYLIST_DESCRIPTION_MAX) {
    return { ok: false, message: `Use a description of ${PLAYLIST_DESCRIPTION_MAX} characters or fewer.` }
  }
  if (input.visibility !== 'public' && input.visibility !== 'private') {
    return { ok: false, message: 'Choose public or private visibility.' }
  }
  return { ok: true, draft: { name, description, visibility: input.visibility } }
}

export function planImport(input: {
  entries: readonly SongEntry[]
  matches: Readonly<Record<string, TrackMatch>>
  policy: DuplicatePolicy
  existingUris: ReadonlySet<string> | null
}): ImportPlan {
  const ready = importReadyTracks(input.entries, input.matches)
  if (input.policy === 'skip_existing' && input.existingUris === null) {
    return { ready, tracks: [], skippedExisting: [], batches: [], blocked: true }
  }
  const existing = input.policy === 'skip_existing' ? input.existingUris ?? new Set<string>() : new Set<string>()
  const tracks: PlannedTrack[] = []
  const skippedExisting: PlannedTrack[] = []
  for (const track of ready) {
    if (existing.has(track.uri)) {
      skippedExisting.push(track)
      continue
    }
    tracks.push(track)
  }
  return { ready, tracks, skippedExisting, batches: buildImportBatches(tracks), blocked: false }
}

export function buildImportBatches(tracks: readonly PlannedTrack[], size = IMPORT_BATCH_SIZE): PlannedTrack[][] {
  const batchSize = Math.max(1, Math.min(IMPORT_BATCH_SIZE, Math.floor(size)))
  const batches: PlannedTrack[][] = []
  for (let index = 0; index < tracks.length; index += batchSize) {
    const batch = tracks.slice(index, index + batchSize)
    if (batch.length > 0) {
      batches.push(batch)
    }
  }
  return batches
}

export function countMatchBuckets(entries: readonly SongEntry[], matches: Readonly<Record<string, TrackMatch>>): {
  inputCount: number
  needsReviewCount: number
  notFoundCount: number
  unresolvedCount: number
} {
  let needsReviewCount = 0
  let notFoundCount = 0
  let unresolvedCount = 0
  for (const entry of entries) {
    const ready = importReadyTracks([entry], matches).length === 1
    if (ready) {
      continue
    }
    unresolvedCount += 1
    const match = matches[entry.id]
    if (match?.status === 'not_found') {
      notFoundCount += 1
    } else if (match?.status === 'needs_review' && match.confirmation !== 'confirmed' && !match.manuallySelected) {
      needsReviewCount += 1
    }
  }
  return { inputCount: entries.length, needsReviewCount, notFoundCount, unresolvedCount }
}
