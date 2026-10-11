export type PublicEnv = {
  spotifyClientId: string
  apiBaseUrl: string
}

type PublicEnvSource = {
  VITE_SPOTIFY_CLIENT_ID?: string
  VITE_API_BASE_URL?: string
}

export function readPublicEnv(source: PublicEnvSource = import.meta.env): PublicEnv {
  return {
    spotifyClientId: source.VITE_SPOTIFY_CLIENT_ID?.trim() ?? '',
    apiBaseUrl: source.VITE_API_BASE_URL?.trim() ?? '',
  }
}
