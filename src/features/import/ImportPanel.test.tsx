import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SpotifySession } from '../auth/session.ts'
import { SpotifyAuthProvider } from '../auth/SpotifyAuthProvider.tsx'
import type { SongEntry, TrackMatch } from '../../shared/types/index.ts'
import { ImportPanel } from './ImportPanel.tsx'

function signedInSession(): SpotifySession {
  const snapshot = {
    status: 'signed_in' as const,
    account: { accountId: 'user', displayName: 'Ada', imageUrl: null, profileUrl: null },
    error: null,
    isConfigured: true,
    configurationMessage: null,
    grantedScopes: ['playlist-read-private', 'playlist-modify-private', 'playlist-modify-public'],
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    handleCallbackIfPresent: async () => {},
    connect: async () => {},
    disconnect: () => {},
    getValidAccessToken: async () => 'token',
    forceRefreshAccessToken: async () => 'token',
  } as unknown as SpotifySession
}

const entry: SongEntry = {
  id: '1',
  source: 'manual',
  originalText: 'The Weeknd - Blinding Lights',
  originalLine: 1,
  artist: 'The Weeknd',
  title: 'Blinding Lights',
  issue: null,
}

const match: TrackMatch = {
  status: 'matched',
  candidates: [{
    trackId: 'track1',
    uri: 'spotify:track:track1',
    title: 'Blinding Lights',
    artists: ['The Weeknd'],
    albumName: 'After Hours',
    imageUrl: null,
    externalUrl: 'https://open.spotify.com/track/track1',
    durationMs: 2000,
    available: true,
    score: 96,
    confidence: 'high',
    versionLabels: [],
  }],
  selectedTrackId: 'track1',
  confidence: 'high',
  score: 96,
  confirmation: 'unreviewed',
  manuallySelected: false,
  errorMessage: null,
  queryArtist: 'The Weeknd',
  queryTitle: 'Blinding Lights',
}

function playlistBody() {
  return {
    items: [{
      id: 'playlist1',
      name: 'Night Drive',
      collaborative: false,
      public: false,
      owner: { id: 'user', display_name: 'Ada' },
      items: { total: 4 },
      images: [],
      external_urls: { spotify: 'https://open.spotify.com/playlist/playlist1' },
    }],
    total: 1,
    next: null,
  }
}

function renderPanel() {
  return render(
    <SpotifyAuthProvider session={signedInSession()}>
      <ImportPanel entries={[entry]} matches={{ '1': match }} onBack={() => {}} />
    </SpotifyAuthProvider>,
  )
}

describe('playlist import screen', () => {
  it('imports into an existing playlist only after confirmation', async () => {
    const user = userEvent.setup()
    const posts: string[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/items') && init?.method !== 'POST') {
        return new Response(JSON.stringify({ items: [{ item: { uri: 'spotify:track:other', type: 'track' } }], total: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (init?.method === 'POST') {
        posts.push(url.pathname)
        return new Response(JSON.stringify({ snapshot_id: 'snap' }), { status: 201, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify(playlistBody()), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchImpl)

    renderPanel()
    expect(await screen.findByRole('button', { name: /Night Drive/ })).toBeInTheDocument()
    expect(posts).toEqual([])
    await user.click(screen.getByRole('button', { name: /Night Drive/ }))
    await user.click(screen.getByRole('button', { name: 'Review import' }))
    expect(screen.getByText('Songs in input')).toBeInTheDocument()
    expect(screen.getByText('Ready to import')).toBeInTheDocument()
    const confirm = screen.getByRole('button', { name: 'Add 1 song to playlist' })
    await user.click(confirm)
    await user.click(confirm)
    await waitFor(() => expect(screen.getByText('Playlist updated successfully!')).toBeInTheDocument())
    expect(posts).toEqual(['/v1/playlists/playlist1/items'])
    expect(screen.getByRole('link', { name: 'Open in Spotify' })).toHaveAttribute('href', 'https://open.spotify.com/playlist/playlist1')
  })

  it('validates a new playlist and creates it only when the import is confirmed', async () => {
    const user = userEvent.setup()
    const bodies: unknown[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      if (init?.method === 'POST') {
        bodies.push({ path: url.pathname, body: JSON.parse(String(init.body)) })
        if (url.pathname === '/v1/me/playlists') {
          return new Response(JSON.stringify({ id: 'created1', name: 'Night Drive', external_urls: { spotify: 'https://open.spotify.com/playlist/created1' } }), { status: 201, headers: { 'Content-Type': 'application/json' } })
        }
        return new Response(JSON.stringify({ snapshot_id: 'snap' }), { status: 201, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ items: [], total: 0, next: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchImpl)

    renderPanel()
    await user.click(await screen.findByRole('radio', { name: 'New playlist' }))
    await user.click(screen.getByRole('button', { name: 'Review import' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a playlist name.')
    expect(bodies).toEqual([])

    await user.type(screen.getByRole('textbox', { name: 'Playlist name' }), '  Night Drive  ')
    await user.click(screen.getByRole('radio', { name: 'Public' }))
    await user.click(screen.getByRole('radio', { name: 'Private' }))
    await user.click(screen.getByRole('button', { name: 'Review import' }))
    await user.click(screen.getByRole('button', { name: 'Create playlist and import 1 song' }))
    await waitFor(() => expect(screen.getByText('Your playlist is ready!')).toBeInTheDocument())
    expect(bodies).toEqual([
      { path: '/v1/me/playlists', body: { name: 'Night Drive', public: false } },
      { path: '/v1/playlists/created1/items', body: { uris: ['spotify:track:track1'] } },
    ])
  })
})
