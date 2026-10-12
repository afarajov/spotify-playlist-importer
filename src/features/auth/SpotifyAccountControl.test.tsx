import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SpotifyAccountControlView } from './SpotifyAccountControl.tsx'

const account = {
  accountId: 'acct_1',
  userId: null,
  displayName: 'Ada Lovelace',
  imageUrl: 'https://i.scdn.co/image/ada',
  profileUrl: 'https://open.spotify.com/user/ada',
}

function renderControl(overrides: Partial<Parameters<typeof SpotifyAccountControlView>[0]> = {}) {
  const onConnect = vi.fn()
  const onDisconnect = vi.fn()
  render(
    <SpotifyAccountControlView
      status="signed_out"
      isConfigured
      account={null}
      error={null}
      configurationMessage={null}
      onConnect={onConnect}
      onDisconnect={onDisconnect}
      {...overrides}
    />,
  )
  return { onConnect, onDisconnect }
}

describe('Spotify account control', () => {
  it('shows a disabled explanation when Spotify is not configured', () => {
    renderControl({
      isConfigured: false,
      configurationMessage: 'Add VITE_SPOTIFY_CLIENT_ID and VITE_SPOTIFY_REDIRECT_URI before connecting a Spotify account.',
    })

    expect(screen.getByRole('button', { name: /connect spotify/i })).toBeDisabled()
    expect(screen.getByText('Not configured')).toBeInTheDocument()
    expect(screen.getByText(/VITE_SPOTIFY_CLIENT_ID and VITE_SPOTIFY_REDIRECT_URI/)).toBeInTheDocument()
  })

  it('starts Spotify sign-in from the disconnected state', async () => {
    const user = userEvent.setup()
    const { onConnect } = renderControl()

    await user.click(screen.getByRole('button', { name: /connect spotify/i }))

    expect(onConnect).toHaveBeenCalledOnce()
  })

  it('shows that a connection is in progress', () => {
    renderControl({ status: 'exchanging' })

    expect(screen.getByRole('button', { name: /connecting/i })).toBeDisabled()
    expect(screen.queryByText('Not configured')).not.toBeInTheDocument()
  })

  it('shows the connected account and disconnects from the menu', async () => {
    const user = userEvent.setup()
    const { onDisconnect } = renderControl({ status: 'signed_in', account })

    expect(document.querySelector('img')).toHaveAttribute('src', account.imageUrl)
    await user.click(screen.getByRole('button', { name: 'Ada Lovelace' }))

    expect(screen.getByRole('menu', { name: 'Spotify account' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Open Spotify profile' })).toHaveAttribute('href', account.profileUrl)
    await user.click(screen.getByRole('menuitem', { name: 'Disconnect' }))

    expect(onDisconnect).toHaveBeenCalledOnce()
  })

  it('uses initials when the profile has no image and hides a non-https profile link', async () => {
    const user = userEvent.setup()
    renderControl({
      status: 'signed_in',
      account: { ...account, displayName: null, imageUrl: null, profileUrl: 'http://open.spotify.com/user/ada' },
    })

    expect(screen.getByRole('button', { name: 'Spotify account' })).toHaveTextContent('S')
    await user.click(screen.getByRole('button', { name: 'Spotify account' }))
    expect(screen.queryByRole('menuitem', { name: 'Open Spotify profile' })).not.toBeInTheDocument()
  })

  it('shows an authentication error without removing the rest of the page controls', () => {
    renderControl({
      error: { code: 'access_denied', message: 'Spotify access was declined. You can connect again when you are ready.' },
    })

    expect(screen.getByRole('alert')).toHaveTextContent(/declined/)
    expect(screen.getByRole('button', { name: /connect spotify/i })).toBeEnabled()
  })

  it('keeps the account trigger compact for narrow screens', () => {
    renderControl({ status: 'signed_in', account: { ...account, displayName: 'A very long Spotify display name' } })

    expect(screen.getByRole('button', { name: /very long/i })).toHaveClass('max-w-[12rem]')
  })
})
