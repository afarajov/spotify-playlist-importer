import type { DuplicatePolicy, PlannedTrack } from './plan.ts'

export type ImportPhase =
  | 'creating_playlist'
  | 'importing'
  | 'completed'
  | 'partially_completed'
  | 'failed'
  | 'needs_reconciliation'

export type BatchPhase = 'pending' | 'submitting' | 'succeeded' | 'failed' | 'uncertain'

export type CreationPhase = 'not_needed' | 'pending' | 'succeeded' | 'failed' | 'uncertain'

export type ImportBatch = {
  index: number
  songIds: string[]
  uris: string[]
  phase: BatchPhase
  snapshotId: string | null
  message: string | null
}

export type ImportDestinationSnapshot =
  | { kind: 'existing'; playlistId: string; name: string; ownerName: string; externalUrl: string | null }
  | { kind: 'new'; name: string; description: string; visibility: 'public' | 'private' }

export type ImportOperation = {
  id: string
  phase: ImportPhase
  creation: CreationPhase
  destination: ImportDestinationSnapshot
  playlistId: string | null
  playlistUrl: string | null
  playlistName: string
  policy: DuplicatePolicy
  tracks: PlannedTrack[]
  skippedExisting: PlannedTrack[]
  unresolvedCount: number
  inputCount: number
  needsReviewCount: number
  notFoundCount: number
  baselineTrackUris: string[] | null
  batches: ImportBatch[]
  message: string | null
}

export function addedCount(operation: ImportOperation): number {
  return operation.batches.filter((batch) => batch.phase === 'succeeded').reduce((total, batch) => total + batch.uris.length, 0)
}

export function failedCount(operation: ImportOperation): number {
  return operation.batches.filter((batch) => batch.phase === 'failed').reduce((total, batch) => total + batch.uris.length, 0)
}

export function uncertainCount(operation: ImportOperation): number {
  return operation.batches.filter((batch) => batch.phase === 'uncertain').reduce((total, batch) => total + batch.uris.length, 0)
}

export function phaseAfterBatches(operation: ImportOperation): ImportPhase {
  if (operation.creation === 'uncertain' || operation.batches.some((batch) => batch.phase === 'uncertain')) {
    return 'needs_reconciliation'
  }
  if (operation.creation === 'failed' && operation.playlistId === null) {
    return 'failed'
  }
  const failed = operation.batches.some((batch) => batch.phase === 'failed')
  const pending = operation.batches.some((batch) => batch.phase === 'pending' || batch.phase === 'submitting')
  const succeeded = operation.batches.some((batch) => batch.phase === 'succeeded')
  if (failed && succeeded) {
    return 'partially_completed'
  }
  if (failed) {
    return 'failed'
  }
  if (pending) {
    return 'importing'
  }
  return 'completed'
}
