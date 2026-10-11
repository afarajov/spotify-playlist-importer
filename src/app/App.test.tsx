import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { isSpotifyConfigured, readSpotifyConfig } from '../config/spotify.ts'
import { AUTH_SESSION_STORAGE_KEY, SONG_DRAFT_STORAGE_KEY } from '../features/auth/storage.ts'
import { App } from './App.tsx'

describe('App', () => {
  it('renders the product introduction and the current workflow step', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Your music. One playlist.' })).toBeInTheDocument()
    expect(
      screen.getByText('Turn a list of songs into a Spotify playlist in just a few steps.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Add Songs')
    expect(screen.queryByText(/completed step/i)).not.toBeInTheDocument()
    const connectButton = screen.getByRole('button', { name: /connect spotify/i })
    if (isSpotifyConfigured(readSpotifyConfig())) {
      expect(connectButton).toBeEnabled()
    } else {
      expect(connectButton).toBeDisabled()
      expect(screen.getByText(/before connecting a Spotify account/i)).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Review Songs' })).toBeDisabled()
    expect(screen.getByLabelText('Choose file')).toBeEnabled()
    expect(screen.getByText(/one song on each line/i)).toBeInTheDocument()
    expect(screen.getByText(/files stay on this device/i)).toBeInTheDocument()
  })

  it('starts in Manual Mode with format guidance', () => {
    render(<App />)

    expect(screen.getByRole('radio', { name: 'Manual Mode' })).toBeChecked()
    expect(screen.getByText('Enter your songs using the required format.')).toBeInTheDocument()
    expect(screen.getByText('Artist - Song Title')).toBeInTheDocument()
    expect(screen.getByLabelText('Song list')).toHaveAttribute(
      'placeholder',
      expect.stringContaining('The Weeknd - Blinding Lights'),
    )
  })

  it('switches to AI Mode guidance without clearing the song list', async () => {
    const user = userEvent.setup()
    render(<App />)

    const songList = screen.getByLabelText('Song list')
    await user.type(songList, 'Radiohead - Creep')
    await user.click(screen.getByRole('radio', { name: 'AI Mode' }))

    expect(screen.getByRole('radio', { name: 'AI Mode' })).toBeChecked()
    expect(screen.getByText('Paste any song list. AI will organize it for you.')).toBeInTheDocument()
    expect(screen.getByText('Messy lists, numbering, and grouped artists are welcome.')).toBeInTheDocument()
    expect(screen.queryByText('Artist - Song Title')).not.toBeInTheDocument()
    expect(songList).toHaveValue('Radiohead - Creep')
    expect(songList.getAttribute('placeholder')).toContain('blinding lights by weekend')
    expect(screen.getByText('1 line · 17 characters')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review Songs' })).toBeDisabled()
    expect(screen.getByLabelText('Choose file')).toBeDisabled()
    expect(screen.getByText(/AI processing is coming later/i)).toBeInTheDocument()
  })

  it('keeps the song list when returning to Manual Mode', async () => {
    const user = userEvent.setup()
    render(<App />)

    const songList = screen.getByLabelText('Song list')
    await user.type(songList, 'Daft Punk - Get Lucky')
    await user.click(screen.getByRole('radio', { name: 'AI Mode' }))
    await user.click(screen.getByRole('radio', { name: 'Manual Mode' }))

    expect(screen.getByRole('radio', { name: 'Manual Mode' })).toBeChecked()
    expect(songList).toHaveValue('Daft Punk - Get Lucky')
    expect(screen.getByText('Artist - Song Title')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review Songs' })).toBeEnabled()
    expect(screen.getByLabelText('Choose file')).toBeEnabled()
  })

  it('restores the song draft after the page is mounted again', async () => {
    const user = userEvent.setup()
    const first = render(<App />)

    await user.type(screen.getByLabelText('Song list'), 'Radiohead - Creep')
    await user.click(screen.getByRole('radio', { name: 'AI Mode' }))
    first.unmount()
    render(<App />)

    expect(screen.getByLabelText('Song list')).toHaveValue('Radiohead - Creep')
    expect(screen.getByRole('radio', { name: 'AI Mode' })).toBeChecked()
  })

  it('keeps the song list when the Spotify account is disconnected', async () => {
    const user = userEvent.setup()
    window.sessionStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        accessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
        refreshTokenExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
        scope: 'user-read-private',
        account: {
          accountId: 'acct_1',
          displayName: 'Ada Lovelace',
          imageUrl: null,
          profileUrl: 'https://open.spotify.com/user/ada',
        },
      }),
    )
    render(<App />)

    const songList = screen.getByLabelText('Song list')
    await user.type(songList, 'Daft Punk - Get Lucky')
    await user.click(screen.getByRole('button', { name: 'Ada Lovelace' }))
    await user.click(screen.getByRole('menuitem', { name: 'Disconnect' }))

    expect(songList).toHaveValue('Daft Punk - Get Lucky')
    expect(screen.getByRole('button', { name: /connect spotify/i })).toBeInTheDocument()
    expect(window.sessionStorage.getItem(SONG_DRAFT_STORAGE_KEY)).toContain('Daft Punk - Get Lucky')
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })
})
