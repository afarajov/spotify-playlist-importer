import type { TrackMatch } from './matching.ts'

export type ParseStatus = 'pending' | 'parsed' | 'uncertain' | 'invalid'

export type SongImportStatus = 'pending' | 'imported' | 'skipped' | 'failed'

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
