import type { InputMode, SongEntry, SongSource } from '../../shared/types/index.ts'
import { browserSessionStorage, SONG_DRAFT_STORAGE_KEY, type KeyValueStorage } from '../auth/storage.ts'

export type SongDraft = {
  mode: InputMode
  text: string
  updatedAt: number
  review: SongEntry[] | null
  reviewedText: string
  prepared: boolean
  fileName: string | null
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
    return {
      mode: parsed.mode,
      text: parsed.text,
      updatedAt: parsed.updatedAt,
      review: isSongEntryList(parsed.review) ? parsed.review : null,
      reviewedText: typeof parsed.reviewedText === 'string' ? parsed.reviewedText : '',
      prepared: parsed.prepared === true && isSongEntryList(parsed.review),
      fileName: typeof parsed.fileName === 'string' ? parsed.fileName : null,
    }
  } catch {
    storage.remove(SONG_DRAFT_STORAGE_KEY)
    return null
  }
}

export function writeSongDraft(
  draft: {
    mode: InputMode
    text: string
    review?: SongEntry[] | null
    reviewedText?: string
    prepared?: boolean
    fileName?: string | null
  },
  storage: KeyValueStorage = browserSessionStorage(),
  now = Date.now(),
): void {
  const existing = readSongDraft(storage)
  if (existing && existing.updatedAt > now) {
    return
  }
  const next: SongDraft = {
    mode: draft.mode,
    text: draft.text,
    updatedAt: now,
    review: draft.review ?? null,
    reviewedText: draft.reviewedText ?? '',
    prepared: draft.prepared === true,
    fileName: draft.fileName ?? null,
  }
  storage.set(SONG_DRAFT_STORAGE_KEY, JSON.stringify(next))
}

function isSongDraft(value: unknown): value is Partial<SongDraft> & Pick<SongDraft, 'mode' | 'text' | 'updatedAt'> {
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

function isSongEntryList(value: unknown): value is SongEntry[] {
  return Array.isArray(value) && value.every(isSongEntry)
}

function isSongEntry(value: unknown): value is SongEntry {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const entry = value as Partial<SongEntry>
  const source: SongSource | null =
    entry.source === 'manual' || entry.source === 'txt' || entry.source === 'csv' || entry.source === 'ai' ? entry.source : null
  return (
    typeof entry.id === 'string' &&
    source !== null &&
    typeof entry.originalText === 'string' &&
    typeof entry.originalLine === 'number' &&
    typeof entry.artist === 'string' &&
    typeof entry.title === 'string' &&
    (entry.issue === null || typeof entry.issue === 'string')
  )
}
