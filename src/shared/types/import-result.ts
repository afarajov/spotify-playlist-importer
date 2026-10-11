export type ImportFailure = {
  songId: string
  message: string
}

export type ImportSummary = {
  playlistId: string | null
  playlistUrl: string | null
  importedCount: number
  skippedCount: number
  failedCount: number
  unresolvedSongIds: string[]
  failures: ImportFailure[]
}
