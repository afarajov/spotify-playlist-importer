import { describe, expect, it } from 'vitest'
import { MAX_SONG_ENTRIES, missingArtistMessage, missingSeparatorMessage, missingTitleMessage } from './limits.ts'
import { parseManualText } from './parse-manual.ts'

const ids = () => {
  let next = 0
  return () => {
    next += 1
    return `song-${next}`
  }
}

describe('manual parsing', () => {
  it('parses one song and several songs in order', () => {
    const one = parseManualText('The Weeknd - Blinding Lights', { createId: ids() })
    expect(one).toMatchObject({
      ok: true,
      entries: [
        {
          id: 'song-1',
          artist: 'The Weeknd',
          title: 'Blinding Lights',
          originalText: 'The Weeknd - Blinding Lights',
          originalLine: 1,
          issue: null,
          source: 'manual',
        },
      ],
    })

    const many = parseManualText(
      ['The Weeknd - Blinding Lights', 'Arctic Monkeys - 505', 'Radiohead - Creep', 'Coldplay - Yellow', 'Daft Punk - Get Lucky'].join('\n'),
      { createId: ids() },
    )
    expect(many.ok).toBe(true)
    if (!many.ok) return
    expect(many.entries.map((entry) => entry.title)).toEqual([
      'Blinding Lights',
      '505',
      'Creep',
      'Yellow',
      'Get Lucky',
    ])
    expect(many.entries.map((entry) => entry.originalLine)).toEqual([1, 2, 3, 4, 5])
  })

  it('ignores empty input and blank lines without dropping later songs', () => {
    expect(parseManualText('   \n\n  ').ok && parseManualText('   \n\n  ')).toMatchObject({ ok: true, entries: [] })
    const parsed = parseManualText('\nThe Weeknd - Blinding Lights\n\nRadiohead - Creep\n', { createId: ids() })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.entries.map((entry) => entry.originalLine)).toEqual([2, 4])
  })

  it('reports a missing separator, artist, or title', () => {
    const parsed = parseManualText(
      ['Blinding Lights', '- Blinding Lights', 'The Weeknd -', 'The Weeknd Blinding Lights'].join('\n'),
      { createId: ids() },
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.entries.map((entry) => entry.issue)).toEqual([
      missingSeparatorMessage,
      missingArtistMessage,
      missingTitleMessage,
      missingSeparatorMessage,
    ])
    expect(parsed.entries[1]?.originalText).toBe('- Blinding Lights')
  })

  it('trims whitespace and keeps hyphens inside the title', () => {
    const parsed = parseManualText('  Jay-Z - Song Title - Live Version  ', { createId: ids() })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.entries[0]).toMatchObject({
      artist: 'Jay-Z',
      title: 'Song Title - Live Version',
      originalText: 'Jay-Z - Song Title - Live Version',
    })
  })

  it('preserves Unicode names and capitalization', () => {
    const parsed = parseManualText("Måneskin - Beggin'\nTarkan - Şımarık", { createId: ids() })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.entries.map((entry) => [entry.artist, entry.title])).toEqual([
      ['Måneskin', "Beggin'"],
      ['Tarkan', 'Şımarık'],
    ])
  })

  it('accepts CRLF lines and a leading BOM', () => {
    const parsed = parseManualText('\uFEFFAC/DC - Thunderstruck\r\nDaft Punk - Get Lucky', { createId: ids() })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.entries.map((entry) => entry.artist)).toEqual(['AC/DC', 'Daft Punk'])
    expect(parsed.entries.map((entry) => entry.originalLine)).toEqual([1, 2])
  })

  it('accepts a misspelled song when the structure is valid', () => {
    const parsed = parseManualText('The Weekend - Blinding Light', { createId: ids() })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.entries[0]?.issue).toBeNull()
  })

  it('rejects lists above the entry limit before returning songs', () => {
    const text = Array.from({ length: MAX_SONG_ENTRIES + 1 }, (_, index) => `Artist - Song ${index}`).join('\n')
    expect(parseManualText(text)).toEqual({
      ok: false,
      message: expect.stringContaining('1,000'),
    })
  })
})
