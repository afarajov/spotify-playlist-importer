import type { InputMode } from '../../shared/types/index.ts'
import { browserSessionStorage, SONG_DRAFT_STORAGE_KEY, type KeyValueStorage } from '../auth/storage.ts'

export type SongDraft = {
  mode: InputMode
  text: string
  updatedAt: number
}

export function readSongDraft(storage: KeyValueStorage = browserSessionStorage()): SongDraft | null {
  const raw = storage.get(SONG_DRAFT_STORAGE_KEY)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isSongDraft(parsed)) {
      storage.remove(SONG_DRAFT_STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    storage.remove(SONG_DRAFT_STORAGE_KEY)
    return null
  }
}

export function writeSongDraft(
  draft: { mode: InputMode; text: string },
  storage: KeyValueStorage = browserSessionStorage(),
  now = Date.now(),
): void {
  const existing = readSongDraft(storage)
  if (existing && existing.updatedAt > now) {
    return
  }
  const next: SongDraft = { mode: draft.mode, text: draft.text, updatedAt: now }
  storage.set(SONG_DRAFT_STORAGE_KEY, JSON.stringify(next))
}

function isSongDraft(value: unknown): value is SongDraft {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const draft = value as Partial<SongDraft>
  return (
    (draft.mode === 'manual' || draft.mode === 'ai') &&
    typeof draft.text === 'string' &&
    typeof draft.updatedAt === 'number'
  )
}
