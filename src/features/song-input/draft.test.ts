import { describe, expect, it } from 'vitest'
import { createMemoryStorage } from '../auth/storage.ts'
import { readSongDraft, writeSongDraft } from './draft.ts'

describe('song draft', () => {
  it('round-trips the mode and text', () => {
    const storage = createMemoryStorage()
    writeSongDraft({ mode: 'ai', text: 'Radiohead - Creep' }, storage, 10)

    expect(readSongDraft(storage)).toEqual({
      mode: 'ai',
      text: 'Radiohead - Creep',
      updatedAt: 10,
      review: null,
      reviewedText: '',
      prepared: false,
      fileName: null,
    })
  })

  it('does not replace a newer draft with an older write', () => {
    const storage = createMemoryStorage()
    writeSongDraft({ mode: 'manual', text: 'newer' }, storage, 20)
    writeSongDraft({ mode: 'ai', text: 'stale' }, storage, 10)

    expect(readSongDraft(storage)?.text).toBe('newer')
  })

  it('drops an unreadable draft', () => {
    const storage = createMemoryStorage()
    storage.set('spotify-playlist-importer.song-draft', '{')

    expect(readSongDraft(storage)).toBeNull()
    expect(storage.get('spotify-playlist-importer.song-draft')).toBeNull()
  })
})
