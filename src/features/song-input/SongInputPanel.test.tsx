import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SpotifyAuthProvider } from '../auth/SpotifyAuthProvider.tsx'
import { SongInputPanel } from './SongInputPanel.tsx'

function renderPanel() {
  return render(
    <SpotifyAuthProvider>
      <SongInputPanel />
    </SpotifyAuthProvider>,
  )
}

const manualList = [
  'The Weeknd - Blinding Lights',
  'Arctic Monkeys 505',
  'Radiohead - Creep',
  '- Yellow',
  'Daft Punk - Get Lucky',
  'The Weeknd - Blinding Lights',
].join('\n')

describe('song review', () => {
  it('reviews manual input, corrects an invalid line, and updates counts', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByLabelText('Song list'), manualList)
    await user.click(screen.getByRole('button', { name: 'Review Songs' }))

    expect(screen.getByRole('dialog', { name: 'Parsed songs' })).toBeInTheDocument()
    expect(screen.getByText('4 songs ready. 2 lines need attention. 1 duplicate.')).toBeInTheDocument()
    expect(screen.getByText('Missing separator. Use Artist - Song Title.')).toBeInTheDocument()
    expect(screen.getByText('Artist name is required.')).toBeInTheDocument()
    expect(screen.getByText('Duplicate')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Find on Spotify' })).toBeDisabled()
    expect(screen.getByText(/Connect Spotify in the header before searching/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit line 2' }))
    await user.type(screen.getByRole('textbox', { name: 'Artist' }), 'Arctic Monkeys')
    await user.clear(screen.getByRole('textbox', { name: 'Song title' }))
    await user.type(screen.getByRole('textbox', { name: 'Song title' }), '505')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.queryByText('Missing separator. Use Artist - Song Title.')).not.toBeInTheDocument()
    expect(screen.getByText('5 songs ready. 1 line needs attention. 1 duplicate.')).toBeInTheDocument()
    expect(screen.getByLabelText('Song list')).toHaveValue(manualList)
  })

  it('cancels an edit and removes a song without losing the typed list', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.type(screen.getByLabelText('Song list'), 'The Weeknd - Blinding Lights\nRadiohead - Creep')
    await user.click(screen.getByRole('button', { name: 'Review Songs' }))

    await user.click(screen.getByRole('button', { name: 'Edit The Weeknd - Blinding Lights' }))
    await user.clear(screen.getByRole('textbox', { name: 'Artist' }))
    await user.type(screen.getByRole('textbox', { name: 'Artist' }), 'Changed')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('The Weeknd')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Changed')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove Radiohead - Creep' }))
    expect(screen.queryByText('Creep')).not.toBeInTheDocument()
    expect(screen.getByText('1 song ready.')).toBeInTheDocument()
    expect(screen.getByLabelText('Song list')).toHaveValue('The Weeknd - Blinding Lights\nRadiohead - Creep')
  })

  it('reopens the current review until the source text changes', async () => {
    const user = userEvent.setup()
    renderPanel()
    const songList = screen.getByLabelText('Song list')
    await user.type(songList, 'The Weeknd - Blinding Lights')
    await user.click(screen.getByRole('button', { name: 'Review Songs' }))
    await user.click(screen.getByRole('button', { name: 'Edit The Weeknd - Blinding Lights' }))
    await user.clear(screen.getByRole('textbox', { name: 'Artist' }))
    await user.type(screen.getByRole('textbox', { name: 'Artist' }), 'Abel')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Close review' }))

    await user.click(screen.getByRole('button', { name: 'Review Songs' }))
    expect(screen.queryByRole('button', { name: 'Replace reviewed songs' })).not.toBeInTheDocument()
    expect(screen.getByText('Abel')).toBeInTheDocument()
    expect(screen.queryByText('The Weeknd')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close review' }))
    await user.type(songList, '\nRadiohead - Creep')
    await user.click(screen.getByRole('button', { name: 'Review Songs' }))
    expect(screen.queryByText('Abel')).not.toBeInTheDocument()
    expect(screen.getByText('Creep')).toBeInTheDocument()
    expect(screen.getByText('The Weeknd')).toBeInTheDocument()
  })

  it('imports a text file and asks before replacing an existing list', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.type(screen.getByLabelText('Song list'), 'Keep - Me')
    const file = new File(['Radiohead - Creep\n<script>alert(1)</script> - Title\n'], 'songs.txt', {
      type: 'text/plain',
    })
    await user.upload(screen.getByLabelText('Choose file'), file)

    expect(screen.getByText('Replace the current song list with songs.txt?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByLabelText('Song list')).toHaveValue('Keep - Me')

    await user.upload(screen.getByLabelText('Choose file'), file)
    await user.click(screen.getByRole('button', { name: 'Replace list' }))
    expect(screen.getByLabelText('Song list')).toHaveValue('Radiohead - Creep\n<script>alert(1)</script> - Title\n')
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
    expect(screen.getByText('songs.txt')).toBeInTheDocument()
    expect(screen.getByText('2 songs ready.')).toBeInTheDocument()
  })

  it('imports a CSV file into the same review list', async () => {
    const user = userEvent.setup()
    renderPanel()
    const file = new File(['title,artist\n505,Arctic Monkeys\nYellow,\n'], 'songs.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText('Choose file'), file)

    expect(screen.getByText('Arctic Monkeys')).toBeInTheDocument()
    expect(screen.getByText('505')).toBeInTheDocument()
    expect(screen.getByText('Artist name is required.')).toBeInTheDocument()
    expect(screen.getByLabelText('Song list')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Find on Spotify' })).toBeDisabled()
    expect(screen.getByText(/Connect Spotify in the header before searching/i)).toBeInTheDocument()
  })

  it('closes the review window without leaving the song list on the page', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.type(screen.getByLabelText('Song list'), 'The Weeknd - Blinding Lights')
    await user.click(screen.getByRole('button', { name: 'Review Songs' }))
    await user.click(screen.getByRole('button', { name: 'Close review' }))

    expect(screen.queryByRole('dialog', { name: 'Parsed songs' })).not.toBeInTheDocument()
    expect(screen.queryByText('Blinding Lights')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View songs' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Review Songs' }))
    expect(screen.getByRole('dialog', { name: 'Parsed songs' })).toBeInTheDocument()
    expect(screen.getByText('Blinding Lights')).toBeInTheDocument()
  })

  it('does not parse AI Mode text and keeps the typed list', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.type(screen.getByLabelText('Song list'), 'not a formatted line')
    await user.click(screen.getByRole('radio', { name: 'AI Mode' }))

    expect(screen.getByRole('button', { name: 'Review Songs' })).toBeDisabled()
    expect(screen.getByLabelText('Choose file')).toBeDisabled()
    expect(screen.queryByRole('region', { name: 'Song review' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Song list')).toHaveValue('not a formatted line')
  })
})
