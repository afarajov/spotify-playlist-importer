import { describe, expect, it } from 'vitest'
import type { SongEntry } from '../../shared/types/index.ts'
import { duplicateEntryIds } from './duplicates.ts'
import { removeSongEntry, updateSongEntry } from './review.ts'

function song(overrides: Partial<SongEntry> & Pick<SongEntry, 'id' | 'artist' | 'title'>): SongEntry {
  return {
    source: 'manual',
    originalText: `${overrides.artist} - ${overrides.title}`,
    originalLine: 1,
    issue: null,
    ...overrides,
  }
}

describe('duplicate detection', () => {
  it('marks a later exact copy and ignores different songs', () => {
    const entries = [
      song({ id: '1', artist: 'The Weeknd', title: 'Blinding Lights', originalLine: 1 }),
      song({ id: '2', artist: 'Radiohead', title: 'Creep', originalLine: 2 }),
      song({ id: '3', artist: 'The Weeknd', title: 'Blinding Lights', originalLine: 3 }),
      song({ id: '4', artist: 'The Weeknd', title: 'Save Your Tears', originalLine: 4 }),
      song({ id: '5', artist: 'Radiohead', title: 'Blinding Lights', originalLine: 5 }),
    ]

    expect([...duplicateEntryIds(entries)]).toEqual(['3'])
  })

  it('treats case and extra whitespace as the same song, including Unicode normalization', () => {
    const entries = [
      song({ id: '1', artist: 'Måneskin', title: 'Beggin\'' }),
      song({ id: '2', artist: '  MÅNESKIN ', title: 'beggin\'' }),
      song({ id: '3', artist: 'Ma\u030aneskin', title: 'Beggin\'' }),
    ]

    expect([...duplicateEntryIds(entries)].sort()).toEqual(['2', '3'])
  })

  it('updates duplicate status after an edit or removal', () => {
    const entries = [
      song({ id: '1', artist: 'The Weeknd', title: 'Blinding Lights' }),
      song({ id: '2', artist: 'the weeknd', title: 'blinding lights' }),
    ]
    const edited = updateSongEntry(entries, '2', 'Radiohead', 'Creep')
    expect([...duplicateEntryIds(edited)]).toEqual([])
    expect(edited[1]).toMatchObject({ artist: 'Radiohead', title: 'Creep', issue: null, id: '2' })
    expect(edited[1]?.originalText).toBe(entries[1]?.originalText)

    const removed = removeSongEntry(entries, '2')
    expect([...duplicateEntryIds(removed)]).toEqual([])
    expect(removed.map((entry) => entry.id)).toEqual(['1'])
  })

  it('keeps an incomplete edit invalid without changing the id or order', () => {
    const entries = [
      song({ id: '1', artist: '', title: 'Blinding Lights', issue: 'Artist name is required.', originalText: '- Blinding Lights' }),
      song({ id: '2', artist: 'Radiohead', title: 'Creep', originalLine: 2 }),
    ]
    const stillInvalid = updateSongEntry(entries, '1', '   ', 'Blinding Lights')
    expect(stillInvalid[0]).toMatchObject({ id: '1', issue: 'Artist name is required.', originalText: '- Blinding Lights' })
    const corrected = updateSongEntry(entries, '1', 'The Weeknd', 'Blinding Lights')
    expect(corrected.map((entry) => entry.id)).toEqual(['1', '2'])
    expect(corrected[0]?.issue).toBeNull()
  })
})
