import { describe, expect, it } from 'vitest'
import { bytesToBase64Url, CODE_VERIFIER_LENGTH, createCodeChallenge, generateCodeVerifier, generateOauthState } from './pkce.ts'

const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

describe('PKCE', () => {
  it('builds a 64-character verifier from the unreserved set', () => {
    const verifier = generateCodeVerifier((length) => new Uint8Array(length).fill(0))

    expect(verifier).toHaveLength(CODE_VERIFIER_LENGTH)
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/)
    expect(verifier).toBe('A'.repeat(CODE_VERIFIER_LENGTH))
  })

  it('rejects random bytes that would bias the character set', () => {
    let call = 0
    const verifier = generateCodeVerifier((length) => {
      call += 1
      return new Uint8Array(length).fill(call === 1 ? 255 : 1)
    })

    expect(verifier.startsWith('B')).toBe(true)
    expect(verifier).not.toContain(String.fromCharCode(255))
  })

  it('creates the RFC 7636 S256 challenge', async () => {
    await expect(createCodeChallenge(RFC_VERIFIER)).resolves.toBe(RFC_CHALLENGE)
  })

  it('encodes a state without base64 padding or reserved characters', () => {
    const state = generateOauthState((length) => new Uint8Array(length).fill(7))

    expect(state).toHaveLength(43)
    expect(state).not.toMatch(/[+/=]/)
    expect(bytesToBase64Url(new Uint8Array([251, 255, 239]))).toBe('-__v')
  })
})
