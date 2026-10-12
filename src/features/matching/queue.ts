import { authMessages } from '../../config/spotify.ts'
import { describeRateLimit, SpotifyAuthError } from '../auth/errors.ts'
import type { TrackMatch } from '../../shared/types/index.ts'
import { SpotifyApiError } from '../../services/spotify/client.ts'
import { MATCHING } from './config.ts'
import { comparisonKey } from './normalize.ts'
import { findCandidates, type TrackSearch } from './find-candidates.ts'
import { rankCandidates, type SpotifyTrack } from './rank.ts'

export type MatchSong = {
  id: string
  artist: string
  title: string
}

export type MatchQueueResult = {
  stop: 'done' | 'cancelled' | 'quota' | 'auth'
}

type MatchGroup = {
  key: string
  artist: string
  title: string
  songs: MatchSong[]
}

export async function matchSongs(input: {
  songs: readonly MatchSong[]
  search: TrackSearch
  signal: AbortSignal
  cache: Map<string, SpotifyTrack[]>
  concurrency?: number
  gapMs?: number
  force?: boolean
  onUpdate: (songId: string, match: TrackMatch) => void
}): Promise<MatchQueueResult> {
  const groups = groupSongs(input.songs)
  let next = 0
  let stopped: MatchQueueResult['stop'] | null = null
  const concurrency = Math.max(1, input.concurrency ?? MATCHING.concurrency)
  const gapMs = input.gapMs ?? MATCHING.requestGapMs
  let lastRequestAt = 0
  let pace = Promise.resolve()

  async function waitTurn() {
    const run = pace.then(async () => {
      const elapsed = Date.now() - lastRequestAt
      const remaining = Math.max(0, gapMs - elapsed)
      if (remaining > 0) {
        await delay(remaining, input.signal)
      }
      lastRequestAt = Date.now()
    })
    pace = run.then(() => undefined, () => undefined)
    await run
  }

  async function worker() {
    while (stopped === null && !input.signal.aborted) {
      const index = next
      next += 1
      const group = groups[index]
      if (!group) {
        return
      }
      try {
        await searchGroup(group, waitTurn)
      } catch (error) {
        if (isAbortError(error) || input.signal.aborted) {
          stopped = 'cancelled'
          return
        }
        const failure = describeFailure(error)
        publish(group, (song) => errorMatch(song, failure.message))
        if (failure.stop) {
          stopped = failure.stop
          return
        }
      }
    }
  }

  async function searchGroup(group: MatchGroup, waitTurn: () => Promise<void>) {
    publish(group, (song) => searchingMatch(song))
    if (!input.force && input.cache.has(group.key)) {
      const ranked = rankCandidates(group.artist, group.title, input.cache.get(group.key) ?? [])
      publish(group, (song) => resultMatch(song, ranked))
      return
    }
    await waitTurn()
    const found = await findCandidates({
      artist: group.artist,
      title: group.title,
      signal: input.signal,
      search: input.search,
    })
    input.cache.set(group.key, found.tracks)
    publish(group, (song) => resultMatch(song, found.result))
  }

  function publish(group: MatchGroup, createMatch: (song: MatchSong) => TrackMatch) {
    for (const song of group.songs) {
      input.onUpdate(song.id, createMatch(song))
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, Math.max(groups.length, 1)) }, () => worker())
  await Promise.all(workers)
  if (input.signal.aborted) {
    return { stop: 'cancelled' }
  }
  return { stop: stopped ?? 'done' }
}

function groupSongs(songs: readonly MatchSong[]): MatchGroup[] {
  const groups = new Map<string, MatchGroup>()
  for (const song of songs) {
    const key = comparisonKey(song.artist, song.title)
    const existing = groups.get(key)
    if (existing) {
      existing.songs.push(song)
      continue
    }
    groups.set(key, { key, artist: song.artist, title: song.title, songs: [song] })
  }
  return [...groups.values()]
}

function searchingMatch(song: MatchSong): TrackMatch {
  return {
    status: 'searching',
    candidates: [],
    selectedTrackId: null,
    confidence: null,
    score: null,
    confirmation: 'unreviewed',
    manuallySelected: false,
    errorMessage: null,
    queryArtist: song.artist,
    queryTitle: song.title,
  }
}

function resultMatch(song: MatchSong, result: { status: TrackMatch['status']; candidates: TrackMatch['candidates']; selectedTrackId: string | null; confidence: TrackMatch['confidence']; score: number | null }): TrackMatch {
  return {
    status: result.status,
    candidates: result.candidates,
    selectedTrackId: result.selectedTrackId,
    confidence: result.confidence,
    score: result.score,
    confirmation: 'unreviewed',
    manuallySelected: false,
    errorMessage: null,
    queryArtist: song.artist,
    queryTitle: song.title,
  }
}

function errorMatch(song: MatchSong, message: string): TrackMatch {
  return {
    ...searchingMatch(song),
    status: 'error',
    errorMessage: message,
  }
}

function describeFailure(error: unknown): { message: string; stop: 'quota' | 'auth' | null } {
  if (error instanceof SpotifyApiError && error.quotaExceeded) {
    return { message: describeRateLimit(null, true), stop: 'quota' }
  }
  if (error instanceof SpotifyApiError && error.kind === 'rate_limited') {
    return { message: describeRateLimit(error.retryAfterSeconds, false), stop: null }
  }
  if (error instanceof SpotifyAuthError || (error instanceof SpotifyApiError && error.kind === 'unauthorized')) {
    return { message: authMessages.session_expired, stop: 'auth' }
  }
  if (error instanceof SpotifyApiError && error.kind === 'forbidden') {
    return { message: authMessages.forbidden, stop: 'auth' }
  }
  if (error instanceof SpotifyApiError && error.kind === 'network') {
    return { message: authMessages.network, stop: null }
  }
  return { message: 'Spotify search is temporarily unavailable.', stop: null }
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (milliseconds === 0) {
    return Promise.resolve()
  }
  if (signal.aborted) {
    return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'))
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(finish, milliseconds)
    signal.addEventListener('abort', cancel, { once: true })
    function finish() {
      signal.removeEventListener('abort', cancel)
      resolve()
    }
    function cancel() {
      clearTimeout(timer)
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    }
  })
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
