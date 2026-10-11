import { createContext } from 'react'
import type { AuthError, AuthStatus, SpotifyAccount } from '../../shared/types/index.ts'

export type SpotifyAuthContextValue = {
  isAuthenticated: boolean
  isLoading: boolean
  status: AuthStatus
  account: SpotifyAccount | null
  error: AuthError | null
  isConfigured: boolean
  configurationMessage: string | null
  connect: () => Promise<void>
  disconnect: () => void
  getValidAccessToken: () => Promise<string>
}

export const SpotifyAuthContext = createContext<SpotifyAuthContextValue | null>(null)
