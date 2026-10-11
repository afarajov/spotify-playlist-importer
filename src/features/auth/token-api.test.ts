import { describe, expect, it } from 'vitest'
import { exchangeAuthorizationCode } from './token-api.ts'

describe('token request', () => {
  it('invokes fetch with the global receiver', async () => {
    const seen = { usesGlobalReceiver: false }
    const fetchImpl = async function (this: unknown) {
      seen.usesGlobalReceiver = this === globalThis
      return new Response(
        JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'user-read-private',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    await exchangeAuthorizationCode({
      clientId: 'client-id',
      code: 'auth-code',
      redirectUri: 'http://127.0.0.1:5173/callback',
      codeVerifier: 'verifier',
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(seen.usesGlobalReceiver).toBe(true)
  })
})
