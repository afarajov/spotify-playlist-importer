import { readPublicEnv } from '../../config/env.ts'
import type { SongEntry } from '../../shared/types/index.ts'
import type { SongParseResult } from './parse-manual.ts'
import { createSongId } from './parse-manual.ts'

const MAX_SONG_TEXT_CHARS = 100_000

type AiSong = {
  artist: string
  title: string
  uncertain: boolean
  note: string
}

export async function parseAiText(text: string, signal?: AbortSignal): Promise<SongParseResult> {
  const trimmed = text.trim()
  if (!trimmed) {
    return { ok: false, message: 'Enter at least one song.' }
  }
  if (trimmed.length > MAX_SONG_TEXT_CHARS) {
    return { ok: false, message: 'This list is too long. Split it into smaller parts.' }
  }

  let response: Response
  try {
    response = await fetch(parseSongsUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed }),
      signal,
    })
  } catch (error) {
    if (isAbort(error)) {
      return { ok: false, message: '' }
    }
    return { ok: false, message: 'The organizer could not be reached. Start the local server and try again.' }
  }

  const payload = await readPayload(response)
  if (!response.ok) {
    return { ok: false, message: aiErrorMessage(payload) }
  }
  if (!payload || !Array.isArray(payload.songs) || payload.songs.some((song) => !isAiSong(song))) {
    return { ok: false, message: 'The organizer returned a list that could not be used.' }
  }
  if (payload.songs.length === 0) {
    return { ok: false, message: 'No songs were found in this text.' }
  }

  return { ok: true, entries: payload.songs.map((song, index) => toEntry(song, index)) }
}

function parseSongsUrl(): string {
  const base = readPublicEnv().apiBaseUrl.replace(/\/+$/, '')
  return `${base}/api/parse-songs`
}

async function readPayload(response: Response): Promise<{ songs?: unknown; error?: unknown } | null> {
  try {
    return await response.json() as { songs?: unknown; error?: unknown }
  } catch {
    return null
  }
}

function isAiSong(value: unknown): value is AiSong {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const song = value as Partial<AiSong>
  return typeof song.artist === 'string'
    && typeof song.title === 'string'
    && typeof song.note === 'string'
    && typeof song.uncertain === 'boolean'
}

function toEntry(song: AiSong, index: number): SongEntry {
  const artist = song.artist.trim()
  const title = song.title.trim()
  const note = song.note.trim()
  const uncertain = song.uncertain || artist.length === 0 || title.length === 0
  return {
    id: createSongId(),
    source: 'ai',
    originalText: artist && title ? `${artist} - ${title}` : note || 'Unclear song',
    originalLine: index + 1,
    artist,
    title,
    issue: uncertain ? note || 'This line is unclear.' : null,
  }
}

function aiErrorMessage(payload: { error?: unknown } | null): string {
  switch (payload?.error) {
    case 'empty_text':
      return 'Enter at least one song.'
    case 'text_too_long':
    case 'body_too_large':
      return 'This list is too long. Split it into smaller parts.'
    case 'rate_limited':
      return 'Too many lists were organized just now. Wait a moment and try again.'
    case 'invalid_model_response':
      return 'The organizer returned a list that could not be used.'
    default:
      return 'The organizer is unavailable. Try again in a moment.'
  }
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
}
