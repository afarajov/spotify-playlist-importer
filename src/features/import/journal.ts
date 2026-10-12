import type { ImportOperation } from './model.ts'

export const IMPORT_JOURNAL_KEY = 'spotify-playlist-importer.import-journal'

export function readImportJournal(storage: Storage = window.sessionStorage): ImportOperation | null {
  const raw = storage.getItem(IMPORT_JOURNAL_KEY)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    const operation = isOperation(parsed) ? parsed : null
    if (!operation) {
      storage.removeItem(IMPORT_JOURNAL_KEY)
      return null
    }
    return normalizeInterrupted(operation)
  } catch {
    storage.removeItem(IMPORT_JOURNAL_KEY)
    return null
  }
}

export function writeImportJournal(operation: ImportOperation | null, storage: Storage = window.sessionStorage): void {
  if (!operation) {
    storage.removeItem(IMPORT_JOURNAL_KEY)
    return
  }
  storage.setItem(IMPORT_JOURNAL_KEY, JSON.stringify(operation))
}

function normalizeInterrupted(operation: ImportOperation): ImportOperation {
  const batches = operation.batches.map((batch) =>
    batch.phase === 'submitting'
      ? { ...batch, phase: 'uncertain' as const, message: 'This batch was still being sent when the page closed. It will not be sent again until you check the playlist.' }
      : batch,
  )
  if (operation.phase !== 'creating_playlist' && operation.phase !== 'importing') {
    return { ...operation, batches }
  }
  const creation = operation.phase === 'creating_playlist' && !operation.playlistId ? 'uncertain' as const : operation.creation
  return {
    ...operation,
    batches,
    creation,
    phase: 'needs_reconciliation',
    message: operation.playlistId
      ? 'The import was interrupted. Songs Spotify already confirmed stay saved. An unfinished batch will not be sent again until you check the playlist.'
      : 'Playlist creation may have succeeded before the page closed. It will not be created again until you confirm that Spotify does not show it.',
  }
}

function isOperation(value: unknown): value is ImportOperation {
  if (!isRecord(value) || typeof value.id !== 'string' || !Array.isArray(value.batches) || !Array.isArray(value.tracks)) {
    return false
  }
  return typeof value.playlistName === 'string' && (value.playlistId === null || typeof value.playlistId === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
