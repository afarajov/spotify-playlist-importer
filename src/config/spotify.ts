import type { AuthErrorCode } from '../shared/types/index.ts'

export const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
export const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1'

/**
 * playlist-read-collaborative is included so a later phase can list collaborative
 * playlists the user may be allowed to edit. Requesting it now avoids a second consent prompt.
 * Email, playback, listening history, library changes, and streaming are intentionally omitted.
 */
export const SPOTIFY_SCOPES = [
  'user-read-private',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public',
] as const

export const ACCESS_TOKEN_REFRESH_LEAD_MS = 60_000
export const PKCE_TRANSACTION_MAX_AGE_MS = 10 * 60 * 1000

export type SpotifyConfig = {
  clientId: string
  redirectUri: string
}

type SpotifyEnvSource = {
  VITE_SPOTIFY_CLIENT_ID?: string
  VITE_SPOTIFY_REDIRECT_URI?: string
}

export function readSpotifyConfig(source: SpotifyEnvSource = import.meta.env): SpotifyConfig {
  return {
    clientId: source.VITE_SPOTIFY_CLIENT_ID?.trim() ?? '',
    redirectUri: source.VITE_SPOTIFY_REDIRECT_URI?.trim() ?? '',
  }
}

export function isSpotifyConfigured(config: SpotifyConfig): boolean {
  return config.clientId.length > 0 && config.redirectUri.length > 0
}

export function missingSpotifyConfigMessage(config: SpotifyConfig): string | null {
  const missing: string[] = []
  if (!config.clientId) {
    missing.push('VITE_SPOTIFY_CLIENT_ID')
  }
  if (!config.redirectUri) {
    missing.push('VITE_SPOTIFY_REDIRECT_URI')
  }
  if (missing.length === 0) {
    return null
  }
  return `Add ${missing.join(' and ')} before connecting a Spotify account.`
}

export function addSixMonths(timestamp: number): number {
  const date = new Date(timestamp)
  date.setUTCMonth(date.getUTCMonth() + 6)
  return date.getTime()
}

export const authMessages: Record<AuthErrorCode, string> = {
  missing_configuration: 'Spotify sign-in is not configured yet.',
  access_denied: 'Spotify access was declined. You can connect again when you are ready.',
  invalid_state: 'The Spotify sign-in response could not be verified. Connect again.',
  missing_code: 'Spotify did not return an authorization code. Connect again.',
  missing_verifier: 'The Spotify sign-in session expired before it finished. Connect again.',
  expired_verifier: 'The Spotify sign-in session expired before it finished. Connect again.',
  token_exchange_failed: 'Spotify could not finish signing you in. Connect again.',
  refresh_failed: 'Spotify could not renew the connection. Connect again.',
  session_expired: 'Your Spotify connection expired. Connect again to continue.',
  invalid_grant: 'Your Spotify connection expired. Connect again to continue.',
  unauthorized: 'Spotify rejected the connection. Connect again.',
  forbidden:
    'Spotify refused this request because the required permission was not granted.',
  rate_limited: 'Spotify is limiting requests right now. Wait a moment, then try again.',
  network: 'Could not reach Spotify. Check your connection and try again.',
  profile_failed: 'Signed in, but the Spotify profile could not be loaded.',
}

export const developmentModeForbiddenMessage =
  'This Spotify account cannot use the app in Development Mode yet. Add the user under Users Management in the Spotify Dashboard. The app owner also needs Spotify Premium.'
