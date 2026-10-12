import { describe, expect, it, vi } from 'vitest'
import { SpotifyApiError } from '../../services/spotify/client.ts'
import { matchSongs } from './queue.ts'
import type { SpotifyTrack } from './rank.ts'

function track(id: string, title: string, artist: string): SpotifyTrack {
  return {
    trackId: id,
    uri: `spotify:track:${id}`,
    title,
    artists: [artist],
    albumName: 'Album',
    imageUrl: null,
    externalUrl: `https://open.spotify.com/track/${id}`,
    durationMs: 1000,
    available: true,
  }
}

describe('bulk matching', () => {
  it('limits concurrency and keeps each song under its own id', async () => {
    let active = 0
    let maxActive = 0
    const updates: string[] = []
    await matchSongs({
      songs: [
        { id: '1', artist: 'The Weeknd', title: 'Blinding Lights' },
        { id: '2', artist: 'Radiohead', title: 'Creep' },
        { id: '3', artist: 'Daft Punk', title: 'Get Lucky' },
      ],
      concurrency: 2,
      gapMs: 0,
      signal: new AbortController().signal,
      cache: new Map(),
      search: async (query) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 10))
        active -= 1
        const title = query.includes('Creep') ? 'Creep' : query.includes('Lucky') ? 'Get Lucky' : 'Blinding Lights'
        const artist = title === 'Creep' ? 'Radiohead' : title === 'Get Lucky' ? 'Daft Punk' : 'The Weeknd'
        return [track(title, title, artist)]
      },
      onUpdate: (songId, match) => {
        if (match.status !== 'searching') {
          updates.push(`${songId}:${match.status}`)
        }
      },
    })
    expect(maxActive).toBeLessThanOrEqual(2)
    expect(updates.sort()).toEqual(['1:matched', '2:matched', '3:matched'])
  })

  it('searches a repeated artist and title once and reuses the cache', async () => {
    const search = vi.fn(async () => [track('creep', 'Creep', 'Radiohead')])
    const cache = new Map<string, SpotifyTrack[]>()
    const songs = [
      { id: '1', artist: 'Radiohead', title: 'Creep' },
      { id: '2', artist: 'radiohead', title: 'Creep' },
    ]
    await matchSongs({ songs, gapMs: 0, signal: new AbortController().signal, cache, search, onUpdate: () => undefined })
    expect(search).toHaveBeenCalledTimes(1)
    search.mockClear()
    await matchSongs({ songs, gapMs: 0, signal: new AbortController().signal, cache, search, onUpdate: () => undefined })
    expect(search).not.toHaveBeenCalled()
  })

  it('cancels work that has not started and keeps a failure separate from not found', async () => {
    const controller = new AbortController()
    const searched: string[] = []
    const statuses = new Map<string, string>()
    const result = await matchSongs({
      songs: [
        { id: '1', artist: 'The Weeknd', title: 'Blinding Lights' },
        { id: '2', artist: 'Radiohead', title: 'Creep' },
      ],
      concurrency: 1,
      gapMs: 0,
      signal: controller.signal,
      cache: new Map(),
      search: async (query) => {
        searched.push(query)
        controller.abort()
        return [track('lights', 'Blinding Lights', 'The Weeknd')]
      },
      onUpdate: (songId, match) => statuses.set(songId, match.status),
    })
    expect(result.stop).toBe('cancelled')
    expect(searched).toHaveLength(1)
    expect(statuses.get('2')).not.toBe('not_found')
  })

  it('stops the queue on quota exhaustion and continues after one song fails', async () => {
    const statuses = new Map<string, string>()
    const quota = await matchSongs({
      songs: [
        { id: '1', artist: 'The Weeknd', title: 'Blinding Lights' },
        { id: '2', artist: 'Radiohead', title: 'Creep' },
        { id: '3', artist: 'Daft Punk', title: 'Get Lucky' },
      ],
      concurrency: 1,
      gapMs: 0,
      signal: new AbortController().signal,
      cache: new Map(),
      search: async (query) => {
        if (query.includes('Creep')) {
          throw new SpotifyApiError({ kind: 'rate_limited', code: 'rate_limited', status: 429, quotaExceeded: true })
        }
        return [track('ok', 'Blinding Lights', 'The Weeknd')]
      },
      onUpdate: (songId, match) => {
        if (match.status !== 'searching') {
          statuses.set(songId, match.status)
        }
      },
    })
    expect(quota.stop).toBe('quota')
    expect(statuses.get('1')).toBe('matched')
    expect(statuses.get('2')).toBe('error')
    expect(statuses.has('3')).toBe(false)

    statuses.clear()
    await matchSongs({
      songs: [
        { id: '1', artist: 'The Weeknd', title: 'Blinding Lights' },
        { id: '2', artist: 'Radiohead', title: 'Creep' },
      ],
      concurrency: 1,
      gapMs: 0,
      signal: new AbortController().signal,
      cache: new Map(),
      search: async (query) => {
        if (query.includes('Creep')) {
          throw new SpotifyApiError({ kind: 'network', code: 'network' })
        }
        return [track('lights', 'Blinding Lights', 'The Weeknd')]
      },
      onUpdate: (songId, match) => {
        if (match.status !== 'searching') {
          statuses.set(songId, match.status)
        }
      },
    })
    expect(statuses.get('1')).toBe('matched')
    expect(statuses.get('2')).toBe('error')
  })

  it('forces a fresh search when retrying a cached song', async () => {
    const cache = new Map<string, SpotifyTrack[]>()
    const search = vi.fn(async () => [track('creep', 'Creep', 'Radiohead')])
    const songs = [{ id: '1', artist: 'Radiohead', title: 'Creep' }]
    await matchSongs({ songs, gapMs: 0, signal: new AbortController().signal, cache, search, onUpdate: () => undefined })
    await matchSongs({ songs, force: true, gapMs: 0, signal: new AbortController().signal, cache, search, onUpdate: () => undefined })
    expect(search).toHaveBeenCalledTimes(2)
  })
})
