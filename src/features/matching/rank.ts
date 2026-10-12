import { MATCHING } from './config.ts'
import { isShortTitle, splitArtists } from './normalize.ts'
import { stringSimilarity } from './similarity.ts'
import { baseTitle, versionAdjustment } from './versions.ts'
import type { ConfidenceLevel, TrackCandidate } from '../../shared/types/index.ts'

export type SpotifyTrack = {
  trackId: string
  uri: string
  title: string
  artists: string[]
  albumName: string
  imageUrl: string | null
  externalUrl: string | null
  durationMs: number | null
  available: boolean
}

type ScoredTrack = TrackCandidate & {
  artistSimilarity: number
  titleSimilarity: number
  versionConflict: boolean
}

export type RankResult = {
  status: 'matched' | 'needs_review' | 'not_found'
  candidates: TrackCandidate[]
  selectedTrackId: string | null
  confidence: ConfidenceLevel | null
  score: number | null
  versionConflict: boolean
}

export function artistSimilarity(query: string, spotifyArtists: readonly string[]): number {
  const queryParts = splitArtists(query)
  const spotifyParts = [...new Set(spotifyArtists.flatMap(splitArtists))]
  if (queryParts.length === 0 || spotifyParts.length === 0) {
    return 0
  }
  const coverage = average(queryParts.map((part) => bestSimilarity(part, spotifyParts)))
  const primary = bestSimilarity(queryParts[0], spotifyParts)
  const firstArtist = stringSimilarity(queryParts[0], spotifyParts[0])
  let score = coverage * 0.65 + primary * 0.35
  const mentionsFirst = queryParts.some((part) => stringSimilarity(part, spotifyParts[0]) >= 0.86)
  if (!mentionsFirst && primary - firstArtist > 0.25 && firstArtist < 0.86) {
    score = Math.min(score, firstArtist)
  }
  return clamp(score)
}

export function titleSimilarity(query: string, trackTitle: string): number {
  return Math.max(stringSimilarity(query, trackTitle), stringSimilarity(baseTitle(query), baseTitle(trackTitle)))
}

export function rankCandidates(artist: string, title: string, tracks: readonly SpotifyTrack[]): RankResult {
  const scored = tracks
    .map((track) => scoreTrack(artist, title, track))
    .sort((left, right) => right.score - left.score || left.trackId.localeCompare(right.trackId))
  const useful = scored.filter((track) => track.score >= 40)
  const best = useful[0]
  if (!best || best.score < MATCHING.minimumScore) {
    return {
      status: 'not_found',
      candidates: useful.map(toCandidate),
      selectedTrackId: null,
      confidence: null,
      score: best?.score ?? null,
      versionConflict: false,
    }
  }
  const rival = useful[1]
  const tied = rival !== undefined && best.score - rival.score <= MATCHING.tieGap && rival.confidence !== 'low'
  const canAutoSelect = best.confidence === 'high' && !best.versionConflict && best.available && !tied
  if (canAutoSelect) {
    return {
      status: 'matched',
      candidates: useful.map(toCandidate),
      selectedTrackId: best.trackId,
      confidence: 'high',
      score: best.score,
      versionConflict: false,
    }
  }
  const propose = best.confidence !== 'low'
  return {
    status: 'needs_review',
    candidates: useful.map(toCandidate),
    selectedTrackId: propose ? best.trackId : null,
    confidence: best.confidence,
    score: best.score,
    versionConflict: best.versionConflict,
  }
}

function scoreTrack(artist: string, title: string, track: SpotifyTrack): ScoredTrack {
  const artistScore = artistSimilarity(artist, track.artists)
  const titleScore = titleSimilarity(title, track.title)
  const version = versionAdjustment(title, track.title)
  let score = Math.round(titleScore * 50 + artistScore * 50 + version.delta)
  if (!track.available) {
    score -= 10
  }
  score = Math.min(100, Math.max(0, score))
  let confidence = confidenceFor(score, artistScore, titleScore, title)
  if (!track.available && confidence === 'high') {
    confidence = 'medium'
  }
  return {
    trackId: track.trackId,
    uri: track.uri,
    title: track.title,
    artists: track.artists,
    albumName: track.albumName,
    imageUrl: track.imageUrl,
    externalUrl: track.externalUrl,
    durationMs: track.durationMs,
    available: track.available,
    score,
    confidence,
    versionLabels: version.labels,
    artistSimilarity: artistScore,
    titleSimilarity: titleScore,
    versionConflict: version.conflict || !track.available,
  }
}

function confidenceFor(score: number, artistScore: number, titleScore: number, title: string): ConfidenceLevel {
  const shortTitle = isShortTitle(title)
  const artistGate = shortTitle ? MATCHING.shortTitleArtist : MATCHING.highArtist
  if (score >= MATCHING.highScore && artistScore >= artistGate && titleScore >= MATCHING.highTitle) {
    return 'high'
  }
  if (score >= MATCHING.mediumScore && artistScore >= MATCHING.mediumArtist && titleScore >= MATCHING.mediumTitle) {
    return 'medium'
  }
  return 'low'
}

function toCandidate(track: ScoredTrack): TrackCandidate {
  return {
    trackId: track.trackId,
    uri: track.uri,
    title: track.title,
    artists: track.artists,
    albumName: track.albumName,
    imageUrl: track.imageUrl,
    externalUrl: track.externalUrl,
    durationMs: track.durationMs,
    available: track.available,
    score: track.score,
    confidence: track.confidence,
    versionLabels: track.versionLabels,
  }
}

function bestSimilarity(value: string, options: readonly string[]): number {
  return options.reduce((best, option) => Math.max(best, stringSimilarity(value, option)), 0)
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}
