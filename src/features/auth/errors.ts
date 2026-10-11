import { authMessages } from '../../config/spotify.ts'
import type { AuthError, AuthErrorCode } from '../../shared/types/index.ts'

export class SpotifyAuthError extends Error {
  readonly code: AuthErrorCode

  constructor(code: AuthErrorCode, message = authMessages[code]) {
    super(message)
    this.name = 'SpotifyAuthError'
    this.code = code
  }
}

export function authError(code: AuthErrorCode, message = authMessages[code]): AuthError {
  return { code, message }
}

export function isSpotifyAuthError(error: unknown): error is SpotifyAuthError {
  return error instanceof SpotifyAuthError
}

export function describeRateLimit(retryAfterSeconds: number | null, quotaExceeded: boolean): string {
  if (quotaExceeded) {
    return "Spotify's development quota has been reached. Wait and try again later."
  }
  if (retryAfterSeconds !== null) {
    return `Spotify is limiting requests right now. Try again in ${retryAfterSeconds} seconds.`
  }
  return authMessages.rate_limited
}
