import type { SongEntry } from '../../shared/types/index.ts'
import { validationIssue } from './parse-manual.ts'

export function updateSongEntry(
  entries: readonly SongEntry[],
  id: string,
  artist: string,
  title: string,
): SongEntry[] {
  const nextArtist = artist.trim()
  const nextTitle = title.trim()
  return entries.map((entry) => {
    if (entry.id !== id) {
      return entry
    }
    return {
      ...entry,
      artist: nextArtist,
      title: nextTitle,
      issue: validationIssue(nextArtist, nextTitle),
    }
  })
}

export function removeSongEntry(entries: readonly SongEntry[], id: string): SongEntry[] {
  return entries.filter((entry) => entry.id !== id)
}

export function summarizeSongs(entries: readonly SongEntry[], duplicateIds: ReadonlySet<string>) {
  const valid = entries.filter((entry) => entry.issue === null).length
  return {
    total: entries.length,
    valid,
    attention: entries.length - valid,
    duplicates: duplicateIds.size,
  }
}

export function formatSongSummary(summary: { valid: number; attention: number; duplicates: number }): string {
  const ready = `${summary.valid} ${summary.valid === 1 ? 'song' : 'songs'} ready`
  const parts = [ready]
  if (summary.attention > 0) {
    parts.push(`${summary.attention} ${summary.attention === 1 ? 'line needs' : 'lines need'} attention`)
  }
  if (summary.duplicates > 0) {
    parts.push(`${summary.duplicates} ${summary.duplicates === 1 ? 'duplicate' : 'duplicates'}`)
  }
  return `${parts.join('. ')}.`
}
