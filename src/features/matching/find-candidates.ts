import { MATCHING } from './config.ts'
import { rankCandidates, type RankResult, type SpotifyTrack } from './rank.ts'

export type TrackSearch = (query: string, signal: AbortSignal) => Promise<SpotifyTrack[]>

export function buildSearchQueries(artist: string, title: string): string[] {
  const safeArtist = quoteFilter(artist)
  const safeTitle = quoteFilter(title)
  const queries = [
    `track:"${safeTitle}" artist:"${safeArtist}"`,
    `${safeArtist} ${safeTitle}`.trim(),
    `track:"${safeTitle}"`,
  ]
  return [...new Set(queries.filter((query) => query.length > 0))].slice(0, MATCHING.maxSearchesPerSong)
}

export async function findCandidates(input: {
  artist: string
  title: string
  search: TrackSearch
  signal: AbortSignal
}): Promise<{ result: RankResult; tracks: SpotifyTrack[] }> {
  const found = new Map<string, SpotifyTrack>()
  let latest = rankCandidates(input.artist, input.title, [])
  for (const query of buildSearchQueries(input.artist, input.title)) {
    if (input.signal.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
    const batch = await input.search(query, input.signal)
    for (const track of batch) {
      found.set(track.trackId, track)
    }
    latest = rankCandidates(input.artist, input.title, [...found.values()])
    if (latest.status === 'matched' && (latest.score ?? 0) >= MATCHING.earlyStopScore && !latest.versionConflict) {
      break
    }
  }
  return { result: latest, tracks: [...found.values()] }
}

function quoteFilter(value: string): string {
  return value.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim()
}
