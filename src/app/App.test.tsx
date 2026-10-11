import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
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
    expect(screen.getByRole('button', { name: /connect spotify/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Find My Songs' })).toBeDisabled()
    expect(screen.getByLabelText('Choose file')).toBeDisabled()
    expect(screen.getByText(/song processing will be available in a later phase/i)).toBeInTheDocument()
    expect(screen.getByText(/\.txt and \.csv import will be available in a later stage/i)).toBeInTheDocument()
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
  })
})
