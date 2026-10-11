import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSpotifySession, warnIfSpotifyIsUnconfigured, type SpotifySession } from './session.ts'
import { SpotifyAuthContext, type SpotifyAuthContextValue } from './auth-context.ts'

export function SpotifyAuthProvider({
  children,
  session,
}: {
  children: ReactNode
  session?: SpotifySession
}) {
  const [spotifySession] = useState(() => session ?? getSpotifySession())
  const [snapshot, setSnapshot] = useState(() => spotifySession.getSnapshot())

  useEffect(() => {
    warnIfSpotifyIsUnconfigured()
  }, [])

  useEffect(() => spotifySession.subscribe((next) => {
    setSnapshot(next)
  }), [spotifySession])

  useEffect(() => {
    void spotifySession.handleCallbackIfPresent()
  }, [spotifySession])

  const value = useMemo<SpotifyAuthContextValue>(
    () => ({
      isAuthenticated: snapshot.status === 'signed_in',
      isLoading: snapshot.status === 'redirecting' || snapshot.status === 'exchanging',
      status: snapshot.status,
      account: snapshot.account,
      error: snapshot.error,
      isConfigured: snapshot.isConfigured,
      configurationMessage: snapshot.configurationMessage,
      connect: () => spotifySession.connect(),
      disconnect: () => {
        spotifySession.disconnect()
      },
      getValidAccessToken: () => spotifySession.getValidAccessToken(),
    }),
    [snapshot, spotifySession],
  )

  return <SpotifyAuthContext.Provider value={value}>{children}</SpotifyAuthContext.Provider>
}
