import type { TrackMatch } from './matching.ts'

export type ParseStatus = 'pending' | 'parsed' | 'uncertain' | 'invalid'

export type SongImportStatus = 'pending' | 'imported' | 'skipped' | 'failed'

export type SongSource = 'manual' | 'txt' | 'csv' | 'ai'

/**
 * A song line after manual or file parsing.
 * `artist` and `title` are the current edited values. `originalText` stays as imported.
 * Spotify search results are not stored here.
 */
export type SongEntry = {
  id: string
  source: SongSource
  originalText: string
  originalLine: number
  artist: string
  title: string
  issue: string | null
}

export type SongRecord = {
  id: string
  originalText: string
  position: number
  artist: string | null
  title: string | null
  parseStatus: ParseStatus
  parseNote: string | null
  match: TrackMatch
  importStatus: SongImportStatus
}

export type ParseIssue = {
  position: number | null
  rawText: string
  message: string
}

export type ParseResult = {
  songs: SongRecord[]
  issues: ParseIssue[]
}
