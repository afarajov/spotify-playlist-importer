import type { SongEntry } from '../../shared/types/index.ts'

export function songComparisonKey(artist: string, title: string): string {
  return `${normalizeSongPart(artist)}\u0000${normalizeSongPart(title)}`
}

export function withoutProblemEntries(entries: readonly SongEntry[]): SongEntry[] {
  const duplicates = duplicateEntryIds(entries)
  return entries.filter(
    (entry) => entry.issue === null && entry.artist.trim().length > 0 && entry.title.trim().length > 0 && !duplicates.has(entry.id),
  )
}

export function duplicateEntryIds(entries: readonly SongEntry[]): Set<string> {
  const firstByKey = new Map<string, string>()
  const duplicates = new Set<string>()
  for (const entry of entries) {
    if (entry.issue) {
      continue
    }
    const key = songComparisonKey(entry.artist, entry.title)
    if (!firstByKey.has(key)) {
      firstByKey.set(key, entry.id)
      continue
    }
    duplicates.add(entry.id)
  }
  return duplicates
}

export function normalizeSongPart(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
}
