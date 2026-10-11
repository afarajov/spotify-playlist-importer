import Papa from 'papaparse'
import type { SongEntry } from '../../shared/types/index.ts'
import { MAX_SONG_ENTRIES, tooManySongsMessage } from './limits.ts'
import { createSongId, stripBom, validationIssue, type SongParseResult } from './parse-manual.ts'

type ParseOptions = {
  createId?: () => string
}

export function parseCsvText(text: string, options: ParseOptions = {}): SongParseResult {
  const createId = options.createId ?? createSongId
  const parsed = Papa.parse<string[]>(stripBom(text), {
    header: false,
    skipEmptyLines: false,
    delimiter: ',',
  })
  if (parsed.errors.some((error) => error.type === 'Quotes')) {
    return { ok: false, message: 'This CSV file could not be read. Check that quoted values are closed.' }
  }

  const rows = parsed.data
  const headerIndex = rows.findIndex((row) => !isBlankRow(row))
  if (headerIndex === -1) {
    return { ok: true, entries: [] }
  }
  const header = (rows[headerIndex] ?? []).map((cell) => cell.trim().toLowerCase())
  const artistColumn = header.indexOf('artist')
  const titleColumn = header.indexOf('title')
  if (artistColumn === -1 || titleColumn === -1) {
    return { ok: false, message: 'The CSV file needs artist and title columns.' }
  }

  const entries: SongEntry[] = []
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? []
    if (isBlankRow(row)) {
      continue
    }
    if (entries.length >= MAX_SONG_ENTRIES) {
      return { ok: false, message: tooManySongsMessage() }
    }
    const artist = cell(row, artistColumn)
    const title = cell(row, titleColumn)
    const originalText = row.map((value) => value.trim()).filter(Boolean).join(', ')
    entries.push({
      id: createId(),
      source: 'csv',
      originalText,
      originalLine: index + 1,
      artist,
      title,
      issue: validationIssue(artist, title),
    })
  }

  return { ok: true, entries }
}

function cell(row: string[], index: number): string {
  return (row[index] ?? '').trim()
}

function isBlankRow(row: string[] | undefined): boolean {
  return !row || row.every((value) => value.trim() === '')
}
