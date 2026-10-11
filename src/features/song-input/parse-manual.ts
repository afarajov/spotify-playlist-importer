import type { SongEntry, SongSource } from '../../shared/types/index.ts'
import {
  MAX_SONG_ENTRIES,
  missingArtistMessage,
  missingSeparatorMessage,
  missingTitleMessage,
  tooManySongsMessage,
} from './limits.ts'

const SEPARATOR = ' - '

export type SongParseResult =
  | { ok: true; entries: SongEntry[] }
  | { ok: false; message: string }

type ParseOptions = {
  source?: SongSource
  createId?: () => string
}

export function parseManualText(text: string, options: ParseOptions = {}): SongParseResult {
  const source = options.source ?? 'manual'
  const createId = options.createId ?? createSongId
  const lines = stripBom(text).split(/\r\n|\n|\r/)
  const entries: SongEntry[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const originalText = lines[index]?.trim() ?? ''
    if (!originalText) {
      continue
    }
    if (entries.length >= MAX_SONG_ENTRIES) {
      return { ok: false, message: tooManySongsMessage() }
    }
    entries.push(parseManualLine(originalText, index + 1, source, createId))
  }

  return { ok: true, entries }
}

export function validationIssue(artist: string, title: string): string | null {
  if (!artist.trim()) {
    return missingArtistMessage
  }
  if (!title.trim()) {
    return missingTitleMessage
  }
  return null
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function parseManualLine(
  originalText: string,
  originalLine: number,
  source: SongSource,
  createId: () => string,
): SongEntry {
  const separatorAt = originalText.indexOf(SEPARATOR)
  if (separatorAt !== -1) {
    const artist = originalText.slice(0, separatorAt).trim()
    const title = originalText.slice(separatorAt + SEPARATOR.length).trim()
    return entry(createId, source, originalText, originalLine, artist, title, validationIssue(artist, title))
  }
  if (originalText.startsWith('- ')) {
    const title = originalText.slice(2).trim()
    return entry(createId, source, originalText, originalLine, '', title, missingArtistMessage)
  }
  if (originalText.endsWith(' -')) {
    const artist = originalText.slice(0, -2).trim()
    return entry(createId, source, originalText, originalLine, artist, '', missingTitleMessage)
  }
  return entry(createId, source, originalText, originalLine, '', '', missingSeparatorMessage)
}

function entry(
  createId: () => string,
  source: SongSource,
  originalText: string,
  originalLine: number,
  artist: string,
  title: string,
  issue: string | null,
): SongEntry {
  return { id: createId(), source, originalText, originalLine, artist, title, issue }
}

export function createSongId(): string {
  return crypto.randomUUID()
}
