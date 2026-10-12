import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SpotifySession } from '../auth/session.ts'
import { SpotifyAuthProvider } from '../auth/SpotifyAuthProvider.tsx'
import { SongInputPanel } from '../song-input/SongInputPanel.tsx'

function signedInSession(): SpotifySession {
  const snapshot = {
    status: 'signed_in' as const,
    account: { accountId: 'user', displayName: 'Ada', imageUrl: null, profileUrl: null },
    error: null,
    isConfigured: true,
    configurationMessage: null,
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

function spotifyTrack(id: string, name: string, artist: string) {
  return {
    id,
    uri: `spotify:track:${id}`,
    name,
    duration_ms: 180000,
    external_urls: { spotify: `https://open.spotify.com/track/${id}` },
    artists: [{ name: artist }],
    album: {
      name: 'After Hours',
      images: [{ url: 'https://i.scdn.co/image/cover', width: 300, height: 300 }],
    },
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('Spotify match review', () => {
  it('shows a real match, keeps an unrelated song, and drops a stale match after an edit', async () => {
    const user = userEvent.setup()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const query = new URL(String(input)).searchParams.get('q') ?? ''
      if (query.includes('Creep')) {
        return jsonResponse({ tracks: { items: [spotifyTrack('creep', 'Creep', 'Radiohead')] } })
      }
      return jsonResponse({
        tracks: {
          items: [
            spotifyTrack('live', 'Blinding Lights - Live', 'The Weeknd'),
            spotifyTrack('studio', 'Blinding Lights', 'The Weeknd'),
          ],
        },
      })
    })
    vi.stubGlobal('fetch', fetchImpl)

    render(
      <SpotifyAuthProvider session={signedInSession()}>
        <SongInputPanel />
      </SpotifyAuthProvider>,
    )
    await user.type(screen.getByLabelText('Song list'), 'The Weeknd - Blinding Lights\nRadiohead - Creep')
    await user.click(screen.getByRole('button', { name: 'Review Songs' }))
    await user.click(screen.getByRole('button', { name: 'Find on Spotify' }))

    expect(await screen.findByText('High confidence')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('progressbar', { name: 'Spotify search progress' })).toHaveAttribute('aria-valuenow', '2')
    })
    expect(screen.getByText(/2 tracks are ready for import/i)).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Change match' })[0])
    await user.click(screen.getByRole('button', { name: /Blinding Lights - Live/i }))
    expect(screen.getByText(/Confirmed/)).toBeInTheDocument()
    expect(screen.getAllByText('Creep').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Edit The Weeknd - Blinding Lights' }))
    await user.clear(screen.getByRole('textbox', { name: 'Artist' }))
    await user.type(screen.getByRole('textbox', { name: 'Artist' }), 'Abel')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.queryByText('Blinding Lights - Live')).not.toBeInTheDocument()
    expect(screen.getAllByText('Creep').length).toBeGreaterThan(0)
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('type=track') && String(url).includes('limit=10'))).toBe(true)
  })

  it('removes duplicates and unreadable lines before searching', async () => {
    const user = userEvent.setup()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('505')) {
        return jsonResponse({ tracks: { items: [] } })
      }
      return jsonResponse({ tracks: { items: [spotifyTrack('studio', 'Blinding Lights', 'The Weeknd')] } })
    })
    vi.stubGlobal('fetch', fetchImpl)

    render(
      <SpotifyAuthProvider session={signedInSession()}>
        <SongInputPanel />
      </SpotifyAuthProvider>,
    )
    await user.type(
      screen.getByLabelText('Song list'),
      ['The Weeknd - Blinding Lights', 'Arctic Monkeys 505', 'The Weeknd - Blinding Lights', 'Radiohead - Creep'].join('\n'),
    )
    await user.click(screen.getByRole('button', { name: 'Review Songs' }))
    expect(screen.getByText('Duplicate')).toBeInTheDocument()
    expect(screen.getByText('Missing separator. Use Artist - Song Title.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Find on Spotify' }))

    expect(screen.queryByText('Duplicate')).not.toBeInTheDocument()
    expect(screen.queryByText('Missing separator. Use Artist - Song Title.')).not.toBeInTheDocument()
    expect(screen.queryByText('Arctic Monkeys 505')).not.toBeInTheDocument()
    expect(screen.getByText('Removed 2 lines that were duplicates or not written as Artist - Song Title.')).toBeInTheDocument()
    expect(screen.getByLabelText('Song list')).toHaveValue('The Weeknd - Blinding Lights\nRadiohead - Creep')
    await waitFor(() => {
      expect(screen.getByRole('progressbar', { name: 'Spotify search progress' })).toHaveAttribute('aria-valuenow', '2')
    })
    const queries = fetchImpl.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('q') ?? '')
    expect(queries.some((query) => query.includes('505'))).toBe(false)
    expect(queries.filter((query) => query.toLowerCase().includes('blinding lights')).length).toBeGreaterThan(0)
  })

  it('clears a list that has nothing searchable', async () => {
    const user = userEvent.setup()
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)

    render(
      <SpotifyAuthProvider session={signedInSession()}>
        <SongInputPanel />
      </SpotifyAuthProvider>,
    )
    await user.type(screen.getByLabelText('Song list'), 'not a song')
    await user.click(screen.getByRole('button', { name: 'Review Songs' }))
    expect(screen.getByRole('button', { name: 'Find on Spotify' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Find on Spotify' }))

    expect(screen.getByText('Removed 1 line that was a duplicate or not written as Artist - Song Title.')).toBeInTheDocument()
    expect(screen.getByText('No songs left in this list.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Find on Spotify' })).toBeDisabled()
    expect(screen.getByLabelText('Song list')).toHaveValue('')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
