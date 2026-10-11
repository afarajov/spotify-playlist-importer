import { describe, expect, it } from 'vitest'
import { addSixMonths, isSpotifyConfigured, missingSpotifyConfigMessage, readSpotifyConfig } from './spotify.ts'

describe('Spotify configuration', () => {
  it('trims public values and treats blanks as missing', () => {
    expect(readSpotifyConfig({ VITE_SPOTIFY_CLIENT_ID: '  client  ', VITE_SPOTIFY_REDIRECT_URI: ' http://127.0.0.1:5173/callback ' })).toEqual({
      clientId: 'client',
      redirectUri: 'http://127.0.0.1:5173/callback',
    })
    const missing = readSpotifyConfig({})
    expect(isSpotifyConfigured(missing)).toBe(false)
    expect(missingSpotifyConfigMessage(missing)).toBe(
      'Add VITE_SPOTIFY_CLIENT_ID and VITE_SPOTIFY_REDIRECT_URI before connecting a Spotify account.',
    )
    expect(missingSpotifyConfigMessage({ clientId: 'client', redirectUri: '' })).toBe(
      'Add VITE_SPOTIFY_REDIRECT_URI before connecting a Spotify account.',
    )
  })

  it('adds six calendar months in UTC', () => {
    expect(addSixMonths(Date.UTC(2026, 0, 15, 12))).toBe(Date.UTC(2026, 6, 15, 12))
  })
})
