import { describe, expect, it } from 'vitest'
import { readPublicEnv } from './env.ts'

describe('readPublicEnv', () => {
  it('returns empty strings when public variables are missing', () => {
    expect(readPublicEnv({})).toEqual({
      spotifyClientId: '',
      apiBaseUrl: '',
    })
  })

  it('trims public configuration values', () => {
    expect(
      readPublicEnv({
        VITE_SPOTIFY_CLIENT_ID: '  client-id  ',
        VITE_API_BASE_URL: ' http://localhost:8787 ',
      }),
    ).toEqual({
      spotifyClientId: 'client-id',
      apiBaseUrl: 'http://localhost:8787',
    })
  })
})
