export type MatchStatus =
  | 'idle'
  | 'searching'
  | 'matched'
  | 'needs_review'
  | 'not_found'
  | 'error'

export type ConfirmationState = 'unreviewed' | 'confirmed' | 'rejected'

/**
 * Application-level search result.
 * Mapped later from the Spotify Web API. Not an API payload, and never sent to an AI model.
 * `confidence` comes from our ranking algorithm: 0 is no similarity and 1 is an exact normalized match.
 */
export type TrackCandidate = {
  trackId: string
  title: string
  artists: string[]
  albumName: string
  imageUrl: string | null
  durationMs: number
}

export type TrackMatch = {
  status: MatchStatus
  candidates: TrackCandidate[]
  selectedTrackId: string | null
  confidence: number | null
  confirmation: ConfirmationState
  errorMessage: string | null
}
