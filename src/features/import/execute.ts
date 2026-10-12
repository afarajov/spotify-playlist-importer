import { SpotifyAuthError } from '../auth/errors.ts'
import { describeRateLimit } from '../auth/errors.ts'
import { SpotifyApiError, type SpotifyTokenSource } from '../../services/spotify/client.ts'
import { addPlaylistItems, createPlaylist, listPlaylistTrackUris } from '../../services/spotify/playlists.ts'
import { phaseAfterBatches, type ImportBatch, type ImportOperation } from './model.ts'

export type ImportDeps = {
  tokenSource: SpotifyTokenSource
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>
}

let importLocked = false

export function isImportLocked(): boolean {
  return importLocked
}

export async function executeImport(
  operation: ImportOperation,
  deps: ImportDeps,
  onUpdate: (operation: ImportOperation) => void,
): Promise<ImportOperation> {
  if (importLocked) {
    return operation
  }
  importLocked = true
  try {
    return await runImport(operation, deps, onUpdate)
  } finally {
    importLocked = false
  }
}

export async function retryFailedBatches(
  operation: ImportOperation,
  deps: ImportDeps,
  onUpdate: (operation: ImportOperation) => void,
): Promise<ImportOperation> {
  if (operation.batches.every((batch) => batch.phase !== 'failed') && operation.creation !== 'failed') {
    return operation
  }
  const next = {
    ...operation,
    phase: operation.playlistId ? 'importing' as const : 'creating_playlist' as const,
    message: null,
  }
  return executeImport(next, deps, onUpdate)
}

export async function reconcileUncertainImport(
  operation: ImportOperation,
  deps: ImportDeps,
  onUpdate: (operation: ImportOperation) => void,
): Promise<ImportOperation> {
  if (!operation.playlistId || operation.baselineTrackUris === null) {
    const blocked = {
      ...operation,
      phase: 'needs_reconciliation' as const,
      message: 'Spotify did not provide enough playlist detail to check this import. Do not send the songs again unless you can see that they are missing.',
    }
    onUpdate(blocked)
    return blocked
  }
  try {
    const current = await listPlaylistTrackUris({ ...deps, playlistId: operation.playlistId })
    const next = applyReconciliation(operation, current)
    onUpdate(next)
    return next
  } catch (error) {
    const message = error instanceof SpotifyApiError && error.kind === 'forbidden'
      ? 'Spotify did not allow this playlist to be read, so the uncertain songs cannot be checked. Do not send them again unless you can see that they are missing.'
      : importErrorMessage(error)
    const blocked = { ...operation, phase: 'needs_reconciliation' as const, message }
    onUpdate(blocked)
    return blocked
  }
}

export function markUncertainCreationFailed(operation: ImportOperation): ImportOperation {
  if (operation.playlistId || operation.creation !== 'uncertain') {
    return operation
  }
  return {
    ...operation,
    creation: 'failed',
    phase: 'failed',
    message: 'Playlist creation was marked as not completed. You can create it again.',
  }
}

export function markUncertainBatchesFailed(operation: ImportOperation): ImportOperation {
  return {
    ...operation,
    batches: operation.batches.map((batch) =>
      batch.phase === 'uncertain' ? { ...batch, phase: 'failed', message: 'Marked as not added, so this batch can be sent again.' } : batch,
    ),
    phase: 'failed',
    message: 'The uncertain songs were marked as not added. You can send those batches again.',
  }
}

async function runImport(
  operation: ImportOperation,
  deps: ImportDeps,
  onUpdate: (operation: ImportOperation) => void,
): Promise<ImportOperation> {
  let current = operation
  const destination = current.destination
  if (destination.kind === 'new' && !current.playlistId) {
    if (current.creation === 'uncertain') {
      current = { ...current, phase: 'needs_reconciliation', message: 'Playlist creation may have succeeded. It will not be created again until you confirm that Spotify does not show it.' }
      onUpdate(current)
      return current
    }
    current = { ...current, phase: 'creating_playlist', creation: 'pending', message: null }
    onUpdate(current)
    try {
      const created = await createPlaylist({
        ...deps,
        name: destination.name,
        description: destination.description,
        isPublic: destination.visibility === 'public',
      })
      current = {
        ...current,
        creation: 'succeeded',
        playlistId: created.id,
        playlistUrl: created.externalUrl,
        playlistName: created.name,
        baselineTrackUris: current.baselineTrackUris ?? [],
      }
      onUpdate(current)
    } catch (error) {
      const uncertain = isUncertain(error)
      current = {
        ...current,
        creation: uncertain ? 'uncertain' : 'failed',
        phase: uncertain ? 'needs_reconciliation' : 'failed',
        message: uncertain
          ? 'Playlist creation may have succeeded. It will not be created again until you confirm that Spotify does not show it.'
          : importErrorMessage(error),
      }
      onUpdate(current)
      return current
    }
  }

  const playlistId = current.playlistId
  if (!playlistId) {
    current = { ...current, phase: 'failed', message: 'Choose a playlist before importing.' }
    onUpdate(current)
    return current
  }

  for (const batch of current.batches) {
    if (batch.phase === 'succeeded') {
      continue
    }
    if (batch.phase === 'uncertain') {
      current = {
        ...current,
        phase: 'needs_reconciliation',
        message: 'An earlier batch may have been added. Later songs stay waiting until that batch is checked.',
      }
      onUpdate(current)
      return current
    }
    current = updateBatch(current, batch.index, { ...batch, phase: 'submitting', message: null })
    current = { ...current, phase: 'importing' }
    onUpdate(current)
    try {
      const added = await addPlaylistItems({ ...deps, playlistId, uris: batch.uris })
      current = updateBatch(current, batch.index, { ...batch, phase: 'succeeded', snapshotId: added.snapshotId, message: null })
      onUpdate(current)
    } catch (error) {
      const uncertain = isUncertain(error)
      current = updateBatch(current, batch.index, {
        ...batch,
        phase: uncertain ? 'uncertain' : 'failed',
        message: uncertain ? 'Spotify may have added these songs. They will not be sent again until you check the playlist.' : importErrorMessage(error),
      })
      current = { ...current, phase: phaseAfterBatches(current), message: importErrorMessage(error) }
      onUpdate(current)
      return current
    }
  }

  current = { ...current, phase: phaseAfterBatches(current), message: null }
  onUpdate(current)
  return current
}

export function applyReconciliation(operation: ImportOperation, currentUris: readonly string[]): ImportOperation {
  if (operation.baselineTrackUris === null) {
    return operation
  }
  const baseline = operation.baselineTrackUris
  if (currentUris.length < baseline.length || !samePrefix(currentUris, baseline)) {
    return {
      ...operation,
      phase: 'needs_reconciliation',
      message: 'The playlist changed in a way that could not be matched to this import. Do not send the uncertain songs again until you review the playlist.',
    }
  }
  const suffix = currentUris.slice(baseline.length)
  const succeeded = operation.batches.filter((batch) => batch.phase === 'succeeded').flatMap((batch) => batch.uris)
  const uncertain = operation.batches.filter((batch) => batch.phase === 'uncertain')
  const uncertainUris = uncertain.flatMap((batch) => batch.uris)
  if (sameList(suffix, [...succeeded, ...uncertainUris])) {
    const batches = operation.batches.map((batch) => (batch.phase === 'uncertain' ? { ...batch, phase: 'succeeded' as const, message: null } : batch))
    const next = { ...operation, batches, message: null }
    return { ...next, phase: phaseAfterBatches(next) }
  }
  if (sameList(suffix, succeeded)) {
    const batches = operation.batches.map((batch) =>
      batch.phase === 'uncertain' ? { ...batch, phase: 'failed' as const, message: 'These songs were not found at the end of the playlist.' } : batch,
    )
    const next = { ...operation, batches, message: 'The uncertain songs were not added. You can send that batch again.' }
    return { ...next, phase: phaseAfterBatches(next) }
  }
  return {
    ...operation,
    phase: 'needs_reconciliation',
    message: 'The playlist does not clearly show whether the uncertain songs were added. They will not be sent again until you confirm they are missing.',
  }
}

function updateBatch(operation: ImportOperation, index: number, batch: ImportBatch): ImportOperation {
  return { ...operation, batches: operation.batches.map((item) => (item.index === index ? batch : item)) }
}

function isUncertain(error: unknown): boolean {
  if (isAbortError(error)) {
    return true
  }
  if (error instanceof SpotifyApiError) {
    if (error.kind === 'network' || (error.status !== null && error.status >= 500)) {
      return true
    }
    return error.kind === 'request_failed' && error.status === null
  }
  return !(error instanceof SpotifyAuthError)
}

export function importErrorMessage(error: unknown): string {
  if (error instanceof SpotifyApiError) {
    if (error.kind === 'rate_limited') {
      return describeRateLimit(error.retryAfterSeconds, error.quotaExceeded)
    }
    if (error.kind === 'forbidden') {
      return 'Spotify refused this playlist change. The playlist may not be editable with the current permissions.'
    }
    if (error.kind === 'unauthorized') {
      return 'Your Spotify connection expired. Connect again to continue. Songs already added stay in the playlist.'
    }
    if (error.kind === 'network') {
      return 'Could not reach Spotify. Check your connection and try again.'
    }
  }
  if (error instanceof SpotifyAuthError) {
    return error.message
  }
  return 'Spotify could not complete this playlist request.'
}

function samePrefix(values: readonly string[], prefix: readonly string[]): boolean {
  return prefix.every((uri, index) => values[index] === uri)
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((uri, index) => uri === right[index])
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
}
