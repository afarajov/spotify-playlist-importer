import { describe, expect, it, vi } from 'vitest'
import { SpotifyApiError } from './client.ts'
import { addPlaylistItems, createPlaylist, listMyPlaylists, listPlaylistTrackUris, parsePlaylistPage } from './playlists.ts'

const tokenSource = {
  getValidAccessToken: async () => 'access-token',
  forceRefreshAccessToken: async () => 'refreshed-token',
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

function playlist(id: string, ownerId: string, extras: Record<string, unknown> = {}) {
  return {
    id,
    name: `Playlist ${id}`,
    collaborative: false,
    public: false,
    description: 'Night',
    owner: { id: ownerId, display_name: 'Ada' },
    items: { total: 3 },
    images: [{ url: 'https://i.scdn.co/image/cover', width: 300, height: 300 }],
    external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
    ...extras,
  }
}

describe('playlist retrieval', () => {
  it('keeps owned and collaborative playlists and hides followed ones', () => {
    const page = parsePlaylistPage({
      items: [
        playlist('owned', 'user'),
        playlist('collab', 'other', { collaborative: true, public: true, images: [], items: undefined, tracks: { total: 4 } }),
        playlist('followed', 'other'),
        { id: 'bad/id', name: 'Nope', owner: { id: 'user' } },
      ],
      total: 4,
      next: null,
    }, ['user'], 0)

    expect(page.playlists.map((item) => item.id)).toEqual(['owned', 'collab'])
    expect(page.hiddenCount).toBe(1)
    expect(page.playlists[0]).toMatchObject({ canModify: true, editability: 'likely', visibility: 'private', trackCount: 3, imageUrl: 'https://i.scdn.co/image/cover' })
    expect(page.playlists[1]).toMatchObject({ canModify: false, editability: 'unconfirmed', visibility: 'public', trackCount: 4, imageUrl: null })
    expect(page.nextOffset).toBeNull()
  })

  it('recognizes a playlist owned under the legacy Spotify user id', () => {
    const owned = playlist('fresh', 'legacy-user', { owner: { id: 'legacy-user', account_id: 'acct_1', display_name: 'Ada' } })
    const page = parsePlaylistPage({ items: [owned], total: 1, next: null }, ['acct_1', 'legacy-user'], 0)
    expect(page.playlists.map((item) => item.id)).toEqual(['fresh'])
    expect(page.hiddenCount).toBe(0)
    expect(page.playlists[0]).toMatchObject({ canModify: true, editability: 'likely' })

    const onlyAccountId = parsePlaylistPage(
      { items: [playlist('fresh', 'legacy-user')], total: 1, next: null },
      ['acct_1'],
      0,
    )
    expect(onlyAccountId.playlists).toEqual([])
    expect(onlyAccountId.hiddenCount).toBe(1)

    const viaAccountId = parsePlaylistPage(
      { items: [playlist('fresh', 'someone', { owner: { id: 'someone', account_id: 'acct_1', display_name: 'Ada' } })], total: 1, next: null },
      ['acct_1'],
      0,
    )
    expect(viaAccountId.playlists.map((item) => item.id)).toEqual(['fresh'])
  })

  it('requests the next page of 50 and reports an empty collection', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      expect(url.pathname).toBe('/v1/me/playlists')
      expect(url.searchParams.get('limit')).toBe('50')
      const offset = Number(url.searchParams.get('offset'))
      if (offset === 0) {
        return jsonResponse({ items: Array.from({ length: 50 }, (_, index) => playlist(`p${index}`, 'user')), total: 51, next: 'https://api.spotify.com/v1/me/playlists?offset=50&limit=50' })
      }
      return jsonResponse({ items: [playlist('p50', 'user')], total: 51, next: null })
    })

    const first = await listMyPlaylists({ tokenSource, fetchImpl: fetchImpl as typeof fetch, ownerIds: ['user'] })
    const second = await listMyPlaylists({ tokenSource, fetchImpl: fetchImpl as typeof fetch, ownerIds: ['user'], offset: first.nextOffset ?? 0 })
    expect(first.playlists).toHaveLength(50)
    expect(first.nextOffset).toBe(50)
    expect(second.playlists).toHaveLength(1)
    expect(second.nextOffset).toBeNull()

    const empty = parsePlaylistPage({ items: [], total: 0, next: null }, ['user'], 0)
    expect(empty.playlists).toEqual([])
  })

  it('retries a rate limit once and surfaces quota, auth, and malformed responses', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { reason: 'QUOTA_EXCEEDED' } }, 429))
    await expect(listMyPlaylists({ tokenSource, fetchImpl: fetchImpl as typeof fetch, ownerIds: ['user'] })).rejects.toMatchObject({ quotaExceeded: true })
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    const limited = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'slow' } }, 429, { 'Retry-After': '0' }))
      .mockResolvedValueOnce(jsonResponse({ items: [], total: 0, next: null }))
    await expect(listMyPlaylists({ tokenSource, fetchImpl: limited as typeof fetch, ownerIds: ['user'], wait: async () => {} })).resolves.toMatchObject({ playlists: [] })
    expect(limited).toHaveBeenCalledTimes(2)

    const denied = vi.fn(async () => jsonResponse({ error: { message: 'nope' } }, 403))
    await expect(listMyPlaylists({ tokenSource, fetchImpl: denied as typeof fetch, ownerIds: ['user'] })).rejects.toBeInstanceOf(SpotifyApiError)

    expect(() => parsePlaylistPage({ items: 'nope' }, ['user'], 0)).toThrow(SpotifyApiError)
  })
})

describe('playlist creation and item import', () => {
  it('creates a private playlist only from the supplied name and adds tracks in the body', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.pathname === '/v1/me/playlists') {
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toEqual({ name: 'Night  Drive', public: false, description: 'Late' })
        return jsonResponse({ id: 'created1', name: 'Night  Drive', external_urls: { spotify: 'https://open.spotify.com/playlist/created1' } }, 201)
      }
      expect(url.pathname).toBe('/v1/playlists/created1/items')
      expect(init?.method).toBe('POST')
      expect(url.search).toBe('')
      expect(JSON.parse(String(init?.body))).toEqual({ uris: ['spotify:track:aaa', 'spotify:track:bbb'] })
      return jsonResponse({ snapshot_id: 'snap-1' }, 201)
    })

    const created = await createPlaylist({ tokenSource, fetchImpl: fetchImpl as typeof fetch, name: 'Night  Drive', description: 'Late', isPublic: false })
    expect(created.externalUrl).toBe('https://open.spotify.com/playlist/created1')
    const added = await addPlaylistItems({ tokenSource, fetchImpl: fetchImpl as typeof fetch, playlistId: created.id, uris: ['spotify:track:aaa', 'spotify:track:bbb'] })
    expect(added.snapshotId).toBe('snap-1')
  })

  it('rejects an empty batch, a batch over 100, and a success response without a snapshot', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 201))
    await expect(addPlaylistItems({ tokenSource, fetchImpl: fetchImpl as typeof fetch, playlistId: 'created1', uris: [] })).rejects.toBeInstanceOf(SpotifyApiError)
    await expect(addPlaylistItems({ tokenSource, fetchImpl: fetchImpl as typeof fetch, playlistId: 'created1', uris: Array.from({ length: 101 }, (_, index) => `spotify:track:t${index}`) })).rejects.toBeInstanceOf(SpotifyApiError)
    expect(fetchImpl).not.toHaveBeenCalled()
    await expect(addPlaylistItems({ tokenSource, fetchImpl: fetchImpl as typeof fetch, playlistId: 'created1', uris: ['spotify:track:aaa'] })).rejects.toBeInstanceOf(SpotifyApiError)
  })

  it('pages playlist items and reads both current and older item shapes', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const offset = new URL(String(input)).searchParams.get('offset')
      expect(new URL(String(input)).pathname).toBe('/v1/playlists/owned1/items')
      if (offset === '0') {
        return jsonResponse({
          items: [{ item: { uri: 'spotify:track:one', type: 'track' } }, { track: { uri: 'spotify:track:two', type: 'track' } }, { item: { uri: 'spotify:episode:nope', type: 'episode' } }],
          total: 3,
        })
      }
      return jsonResponse({ items: [], total: 3 })
    })
    await expect(listPlaylistTrackUris({ tokenSource, fetchImpl: fetchImpl as typeof fetch, playlistId: 'owned1' })).resolves.toEqual(['spotify:track:one', 'spotify:track:two'])
  })
})
