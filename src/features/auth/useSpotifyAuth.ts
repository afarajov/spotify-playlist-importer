import { useContext } from 'react'
import { SpotifyAuthContext, type SpotifyAuthContextValue } from './auth-context.ts'

export function useSpotifyAuth(): SpotifyAuthContextValue {
  const value = useContext(SpotifyAuthContext)
  if (!value) {
    throw new Error('useSpotifyAuth must be used within SpotifyAuthProvider')
  }
  return value
}
