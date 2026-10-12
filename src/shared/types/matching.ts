export type MatchStatus =
  | 'idle'
  | 'searching'
  | 'matched'
  | 'needs_review'
  | 'not_found'
  | 'error'

export type ConfirmationState = 'unreviewed' | 'confirmed' | 'rejected'

export type ConfidenceLevel = 'high' | 'medium' | 'low'

/**
 * A Spotify track after normalization and local scoring.
 * This is not a raw API payload and is never sent to an AI model.
 * `score` is a 0–100 similarity score, not a probability.
 */
export type TrackCandidate = {
  trackId: string
  uri: string
  title: string
  artists: string[]
  albumName: string
  imageUrl: string | null
  externalUrl: string | null
  durationMs: number | null
  available: boolean
  score: number
  confidence: ConfidenceLevel
  versionLabels: string[]
}

export type TrackMatch = {
  status: MatchStatus
  candidates: TrackCandidate[]
  selectedTrackId: string | null
  confidence: ConfidenceLevel | null
  score: number | null
  confirmation: ConfirmationState
  manuallySelected: boolean
  errorMessage: string | null
  queryArtist: string
  queryTitle: string
}

export type ImportReadyTrack = {
  songId: string
  position: number
  trackId: string
  uri: string
}
