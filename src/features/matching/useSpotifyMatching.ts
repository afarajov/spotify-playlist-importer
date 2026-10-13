import { useEffect, useMemo, useRef, useState } from 'react'
import { authMessages } from '../../config/spotify.ts'
import { useSpotifyAuth } from '../auth/useSpotifyAuth.ts'
import { describeRateLimit } from '../auth/errors.ts'
import { searchTracks } from '../../services/spotify/search.ts'
import type { SpotifyTokenSource } from '../../services/spotify/client.ts'
import type { SongEntry, TrackMatch } from '../../shared/types/index.ts'
import { matchSongs } from './queue.ts'
import { comparisonKey } from './normalize.ts'
import { rankCandidates, type SpotifyTrack } from './rank.ts'
import { importReadyTracks } from './ready.ts'

export type SearchProgress = {
  active: boolean
  total: number
  completed: number
  matched: number
  needsReview: number
  notFound: number
  errors: number
}

const STOP_MESSAGES = {
  quota: describeRateLimit(null, true),
  auth: authMessages.session_expired,
  cancelled: 'Search cancelled. Completed matches are still here.',
  done: null,
} as const

export function useSpotifyMatching(review: SongEntry[] | null) {
  const auth = useSpotifyAuth()
  const [matches, setMatches] = useState<Record<string, TrackMatch>>({})
  const [run, setRun] = useState<{ ids: string[]; active: boolean } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const cacheRef = useRef(new Map<string, SpotifyTrack[]>())
  const abortRef = useRef<AbortController | null>(null)
  const runRef = useRef(0)
  const reviewRef = useRef(review)
  const tokenSource = useMemo<SpotifyTokenSource>(
    () => ({
      getValidAccessToken: () => auth.getValidAccessToken(),
      forceRefreshAccessToken: () => auth.forceRefreshAccessToken(),
    }),
    [auth],
  )

  useEffect(() => {
    reviewRef.current = review
  }, [review])

  const progress = useMemo<SearchProgress | null>(() => {
    if (!run) {
      return null
    }
    const relevant = run.ids.map((id) => matches[id]).filter((match): match is TrackMatch => match !== undefined)
    return {
      active: run.active,
      total: run.ids.length,
      completed: relevant.filter((match) => match.status !== 'searching' && match.status !== 'idle').length,
      matched: relevant.filter((match) => match.status === 'matched' || (match.status === 'needs_review' && match.confirmation === 'confirmed')).length,
      needsReview: relevant.filter((match) => match.status === 'needs_review' && match.confirmation !== 'confirmed').length,
      notFound: relevant.filter((match) => match.status === 'not_found').length,
      errors: relevant.filter((match) => match.status === 'error').length,
    }
  }, [matches, run])

  function applyMatch(generation: number, songId: string, match: TrackMatch) {
    if (generation !== runRef.current) {
      return
    }
    setMatches((current) => {
      const entry = reviewRef.current?.find((item) => item.id === songId)
      if (!entry || entry.artist !== match.queryArtist || entry.title !== match.queryTitle) {
        return current
      }
      const existing = current[songId]
      if (existing?.manuallySelected && match.status !== 'searching' && !match.manuallySelected) {
        return current
      }
      return { ...current, [songId]: match }
    })
  }

  async function searchIds(songs: SongEntry[], force: boolean) {
    if (!auth.isAuthenticated || songs.length === 0) {
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const generation = runRef.current + 1
    runRef.current = generation
    const ids = songs.map((song) => song.id)
    setMatches((current) => clearSearchingExcept(current, ids))
    setNotice(null)
    setRun({ ids, active: true })
    const result = await matchSongs({
      songs,
      force,
      signal: controller.signal,
      cache: cacheRef.current,
      search: (query, signal) => searchTracks({ query, tokenSource, signal }),
      onUpdate: (songId, match) => applyMatch(generation, songId, match),
    })
    if (generation !== runRef.current) {
      return
    }
    if (result.stop === 'cancelled') {
      setMatches((current) => {
        const next = { ...current }
        for (const id of ids) {
          if (next[id]?.status === 'searching') {
            delete next[id]
          }
        }
        return next
      })
    }
    setRun({ ids, active: false })
    setNotice(STOP_MESSAGES[result.stop])
  }

  function find(songs?: readonly SongEntry[]) {
    const source = songs ?? reviewRef.current ?? []
    reviewRef.current = [...source]
    const ready = source.filter((entry) => entry.issue === null && entry.artist.trim() && entry.title.trim())
    void searchIds(ready, false)
  }

  function retry(songId: string) {
    const entry = reviewRef.current?.find((item) => item.id === songId)
    if (!entry || entry.issue) {
      return
    }
    cacheRef.current.delete(comparisonKey(entry.artist, entry.title))
    void searchIds([entry], true)
  }

  function cancel() {
    abortRef.current?.abort()
  }

  function confirm(songId: string) {
    setMatches((current) => {
      const match = current[songId]
      if (!match?.selectedTrackId) {
        return current
      }
      return { ...current, [songId]: { ...match, confirmation: 'confirmed', manuallySelected: true } }
    })
  }

  function select(songId: string, trackId: string) {
    setMatches((current) => {
      const match = current[songId]
      const candidate = match?.candidates.find((item) => item.trackId === trackId)
      if (!match || !candidate) {
        return current
      }
      return {
        ...current,
        [songId]: {
          ...match,
          status: 'matched',
          selectedTrackId: trackId,
          confidence: candidate.confidence,
          score: candidate.score,
          confirmation: 'confirmed',
          manuallySelected: true,
          errorMessage: null,
        },
      }
    })
  }

  async function searchManually(songId: string, query: string) {
    const entry = reviewRef.current?.find((item) => item.id === songId)
    const trimmed = query.trim()
    if (!entry || !auth.isAuthenticated || trimmed.length === 0) {
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const generation = runRef.current + 1
    runRef.current = generation
    setMatches((current) => clearSearchingExcept(current, [songId]))
    applyMatch(generation, songId, {
      status: 'searching',
      candidates: [],
      selectedTrackId: null,
      confidence: null,
      score: null,
      confirmation: 'unreviewed',
      manuallySelected: false,
      errorMessage: null,
      queryArtist: entry.artist,
      queryTitle: entry.title,
    })
    try {
      const tracks = await searchTracks({ query: trimmed, tokenSource, signal: controller.signal })
      const ranked = rankCandidates(entry.artist, entry.title, tracks)
      applyMatch(generation, songId, {
        status: ranked.status,
        candidates: ranked.candidates,
        selectedTrackId: ranked.selectedTrackId,
        confidence: ranked.confidence,
        score: ranked.score,
        confirmation: ranked.selectedTrackId ? 'confirmed' : 'unreviewed',
        manuallySelected: false,
        errorMessage: null,
        queryArtist: entry.artist,
        queryTitle: entry.title,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      applyMatch(generation, songId, {
        status: 'error',
        candidates: [],
        selectedTrackId: null,
        confidence: null,
        score: null,
        confirmation: 'unreviewed',
        manuallySelected: false,
        errorMessage: 'Spotify search is temporarily unavailable.',
        queryArtist: entry.artist,
        queryTitle: entry.title,
      })
    }
  }

  function invalidate(songId: string) {
    setMatches((current) => {
      if (!current[songId]) {
        return current
      }
      const next = { ...current }
      delete next[songId]
      return next
    })
  }

  function reset() {
    abortRef.current?.abort()
    runRef.current += 1
    cacheRef.current.clear()
    setMatches({})
    setRun(null)
    setNotice(null)
  }

  return {
    isAuthenticated: auth.isAuthenticated,
    matches,
    progress,
    notice,
    readyCount: importReadyTracks(review ?? [], matches).length,
    find,
    cancel,
    retry,
    confirm,
    select,
    searchManually,
    invalidate,
    reset,
  }
}

function clearSearchingExcept(current: Record<string, TrackMatch>, ids: readonly string[]): Record<string, TrackMatch> {
  const keep = new Set(ids)
  let changed = false
  const next = { ...current }
  for (const [id, match] of Object.entries(next)) {
    if (match.status === 'searching' && !keep.has(id)) {
      delete next[id]
      changed = true
    }
  }
  return changed ? next : current
}
