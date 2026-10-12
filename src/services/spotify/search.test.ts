import { describe, expect, it, vi } from 'vitest'
import { SpotifyApiError } from './client.ts'
import { searchTracks } from './search.ts'

const tokenSource = {
  getValidAccessToken: async () => 'access-token',
  forceRefreshAccessToken: async () => 'refreshed-token',
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function trackBody(name = 'Blinding Lights') {
  return {
    tracks: {
      items: [
        {
          id: 'track-1',
          uri: 'spotify:track:track-1',
          name,
          duration_ms: 2000,
          external_urls: { spotify: 'https://open.spotify.com/track/track-1' },
          artists: [{ name: 'The Weeknd' }],
          album: { name: 'After Hours', images: [{ url: 'https://i.scdn.co/image/cover', width: 300, height: 300 }] },
        },
      ],
    },
  }
}

describe('Spotify track search', () => {
  it('encodes a track search and clamps the limit to 10', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      expect(url.pathname).toBe('/v1/search')
      expect(url.searchParams.get('type')).toBe('track')
      expect(url.searchParams.get('limit')).toBe('10')
      expect(url.searchParams.get('q')).toBe('track:"505" artist:"AC/DC"')
      return jsonResponse(trackBody('Thunderstruck'))
    })

    const tracks = await searchTracks({
      query: 'track:"505" artist:"AC/DC"',
      limit: 50,
      tokenSource,
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(tracks[0]).toMatchObject({
      trackId: 'track-1',
      uri: 'spotify:track:track-1',
      title: 'Thunderstruck',
      artists: ['The Weeknd'],
      albumName: 'After Hours',
      imageUrl: 'https://i.scdn.co/image/cover',
      externalUrl: 'https://open.spotify.com/track/track-1',
    })
  })

  it('returns an empty list when Spotify has no tracks', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ tracks: { items: [] } }))
    await expect(searchTracks({ query: 'missing', tokenSource, fetchImpl: fetchImpl as typeof fetch })).resolves.toEqual([])
  })

  it('rejects a malformed search payload instead of treating it as no results', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ tracks: {} }))
    await expect(searchTracks({ query: 'broken', tokenSource, fetchImpl: fetchImpl as typeof fetch })).rejects.toBeInstanceOf(SpotifyApiError)
  })

  it('retries a rate limit once and stops on quota exhaustion', async () => {
    const waits: number[] = []
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { status: 429, message: 'slow' } }, 429, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(jsonResponse(trackBody()))
    const tracks = await searchTracks({
      query: 'weeknd',
      tokenSource,
      fetchImpl: fetchImpl as typeof fetch,
      wait: async (milliseconds) => {
        waits.push(milliseconds)
      },
    })
    expect(waits).toEqual([2000])
    expect(tracks).toHaveLength(1)

    const quotaFetch = vi.fn(async () => jsonResponse({ error: { status: 429, reason: 'QUOTA_EXCEEDED' } }, 429))
    await expect(searchTracks({ query: 'weeknd', tokenSource, fetchImpl: quotaFetch as typeof fetch })).rejects.toMatchObject({
      quotaExceeded: true,
    })
    expect(quotaFetch).toHaveBeenCalledTimes(1)
  })

  it('does not report a cancelled search as a network failure', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal)
      controller.abort()
      throw new DOMException('The operation was aborted.', 'AbortError')
    })
    await expect(
      searchTracks({ query: 'weeknd', tokenSource, signal: controller.signal, fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
