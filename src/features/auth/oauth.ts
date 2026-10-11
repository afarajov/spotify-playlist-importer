import { SPOTIFY_AUTHORIZE_URL, SPOTIFY_SCOPES } from '../../config/spotify.ts'

export type AuthorizationUrlInput = {
  clientId: string
  redirectUri: string
  codeChallenge: string
  state: string
  scopes?: readonly string[]
}

export type AuthorizationCallback =
  | { kind: 'code'; code: string; state: string | null }
  | { kind: 'error'; error: string; state: string | null }

export function buildAuthorizationUrl(input: AuthorizationUrlInput): string {
  const url = new URL(SPOTIFY_AUTHORIZE_URL)
  url.searchParams.set('client_id', input.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('code_challenge', input.codeChallenge)
  url.searchParams.set('state', input.state)
  url.searchParams.set('scope', (input.scopes ?? SPOTIFY_SCOPES).join(' '))
  return url.toString()
}

export function parseAuthorizationCallback(search: string): AuthorizationCallback {
  const params = new URLSearchParams(search)
  const state = params.get('state')
  const error = params.get('error')
  if (error) {
    return { kind: 'error', error, state }
  }
  return { kind: 'code', code: params.get('code') ?? '', state }
}

export function oauthStatesMatch(expected: string, received: string | null): boolean {
  if (!received || expected.length === 0 || expected.length !== received.length) {
    return false
  }
  let mismatch = 0
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ received.charCodeAt(index)
  }
  return mismatch === 0
}
