import type { ImportReadyTrack, SongEntry, TrackMatch } from '../../shared/types/index.ts'

export function isImportReady(match: TrackMatch | undefined): boolean {
  if (!match?.selectedTrackId) {
    return false
  }
  const selected = match.candidates.find((candidate) => candidate.trackId === match.selectedTrackId)
  if (!selected?.available || !selected.uri.startsWith('spotify:track:')) {
    return false
  }
  if (match.manuallySelected || match.confirmation === 'confirmed') {
    return true
  }
  return match.status === 'matched' && match.confidence === 'high'
}

export function importReadyTracks(entries: readonly SongEntry[], matches: Readonly<Record<string, TrackMatch>>): ImportReadyTrack[] {
  const ready: ImportReadyTrack[] = []
  entries.forEach((entry, index) => {
    if (entry.issue) {
      return
    }
    const match = matches[entry.id]
    if (!isImportReady(match) || !match.selectedTrackId) {
      return
    }
    const selected = match.candidates.find((candidate) => candidate.trackId === match.selectedTrackId)
    if (!selected) {
      return
    }
    ready.push({
      songId: entry.id,
      position: index + 1,
      trackId: selected.trackId,
      uri: selected.uri,
    })
  })
  return ready
}
