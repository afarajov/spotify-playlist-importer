import { describe, expect, it } from 'vitest'
import { SPOTIFY_SCOPES } from '../../config/spotify.ts'
import { buildAuthorizationUrl, oauthStatesMatch, parseAuthorizationCallback } from './oauth.ts'

const input = {
  clientId: 'client-id',
  redirectUri: 'http://127.0.0.1:5173/callback',
  codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  state: 'state-value',
}

describe('OAuth request', () => {
  it('builds an authorization URL with PKCE and the planned scopes', () => {
    const url = new URL(buildAuthorizationUrl(input))

    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize')
    expect(url.searchParams.get('client_id')).toBe('client-id')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5173/callback')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe(input.codeChallenge)
    expect(url.searchParams.get('state')).toBe('state-value')
    expect(url.searchParams.get('scope')?.split(' ')).toEqual([...SPOTIFY_SCOPES])
    expect(url.searchParams.has('client_secret')).toBe(false)
    expect(url.search).not.toMatch(/user-read-email|user-read-playback|user-library|streaming|user-top-read|user-read-recently-played/)
  })

  it('accepts only the stored state', () => {
    expect(oauthStatesMatch('abc', 'abc')).toBe(true)
    expect(oauthStatesMatch('abc', 'abd')).toBe(false)
    expect(oauthStatesMatch('abc', 'abcd')).toBe(false)
    expect(oauthStatesMatch('abc', null)).toBe(false)
    expect(oauthStatesMatch('', '')).toBe(false)
  })

  it('reads an authorization code or a denial', () => {
    expect(parseAuthorizationCallback('?code=auth-code&state=abc')).toEqual({
      kind: 'code',
      code: 'auth-code',
      state: 'abc',
    })
    expect(parseAuthorizationCallback('?error=access_denied&state=abc')).toEqual({
      kind: 'error',
      error: 'access_denied',
      state: 'abc',
    })
    expect(parseAuthorizationCallback('?state=abc')).toEqual({ kind: 'code', code: '', state: 'abc' })
  })
})
