const VERIFIER_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
export const CODE_VERIFIER_LENGTH = 64

export function generateCodeVerifier(randomBytes: (length: number) => Uint8Array = getRandomBytes): string {
  let verifier = ''
  const charsetSize = VERIFIER_CHARSET.length
  const limit = 256 - (256 % charsetSize)

  while (verifier.length < CODE_VERIFIER_LENGTH) {
    const bytes = randomBytes(CODE_VERIFIER_LENGTH)
    for (const byte of bytes) {
      if (byte >= limit) {
        continue
      }
      verifier += VERIFIER_CHARSET[byte % charsetSize]
      if (verifier.length === CODE_VERIFIER_LENGTH) {
        break
      }
    }
  }

  return verifier
}

export function generateOauthState(randomBytes: (length: number) => Uint8Array = getRandomBytes): string {
  return bytesToBase64Url(randomBytes(32))
}

export async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return bytesToBase64Url(new Uint8Array(digest))
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}
