import { describe, expect, it } from 'vitest'
import { parseSpotifyAccount } from './profile.ts'

describe('Spotify profile', () => {
  it('keeps the stable account id, name, https image, and profile URL', () => {
    expect(
      parseSpotifyAccount({
        account_id: 'acct_1',
        id: 'legacy-id',
        display_name: ' Ada Lovelace ',
        email: 'ada@example.com',
        country: 'SE',
        product: 'premium',
        images: [
          { url: 'http://insecure.example/small', width: 64 },
          { url: 'https://i.scdn.co/image/small', width: 64 },
          { url: 'https://i.scdn.co/image/large', width: 300 },
        ],
        external_urls: { spotify: 'https://open.spotify.com/user/ada' },
      }),
    ).toEqual({
      accountId: 'acct_1',
      userId: 'legacy-id',
      displayName: 'Ada Lovelace',
      imageUrl: 'https://i.scdn.co/image/large',
      profileUrl: 'https://open.spotify.com/user/ada',
    })
  })

  it('tolerates a missing name and image', () => {
    expect(parseSpotifyAccount({ account_id: 'acct_1', display_name: null, images: [] })).toEqual({
      accountId: 'acct_1',
      userId: null,
      displayName: null,
      imageUrl: null,
      profileUrl: null,
    })
    expect(parseSpotifyAccount({ account_id: 'acct_1', uri: 'spotify:user:from-uri' })).toMatchObject({
      userId: 'from-uri',
    })
    expect(parseSpotifyAccount({ id: 'legacy-only' })).toBeNull()
  })
})
