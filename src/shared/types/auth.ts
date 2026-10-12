export type SpotifyAccount = {
  accountId: string
  /** Legacy Spotify user id from `/me`. Playlist owners still use this value. */
  userId: string | null
  displayName: string | null
  imageUrl: string | null
  profileUrl: string | null
}

export type AuthStatus = 'signed_out' | 'redirecting' | 'exchanging' | 'signed_in'

export type AuthErrorCode =
  | 'missing_configuration'
  | 'access_denied'
  | 'invalid_state'
  | 'missing_code'
  | 'missing_verifier'
  | 'expired_verifier'
  | 'token_exchange_failed'
  | 'refresh_failed'
  | 'session_expired'
  | 'invalid_grant'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'network'
  | 'profile_failed'

export type AuthError = {
  code: AuthErrorCode
  message: string
}
