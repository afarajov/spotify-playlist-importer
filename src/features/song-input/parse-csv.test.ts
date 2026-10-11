import { describe, expect, it } from 'vitest'
import { missingArtistMessage, missingTitleMessage } from './limits.ts'
import { parseCsvText } from './parse-csv.ts'

const ids = () => {
  let next = 0
  return () => {
    next += 1
    return `row-${next}`
  }
}

describe('CSV parsing', () => {
  it('reads a standard file and keeps row order', () => {
    const parsed = parseCsvText(
      ['artist,title', 'The Weeknd,Blinding Lights', 'Arctic Monkeys,505', 'Radiohead,Creep'].join('\n'),
      { createId: ids() },
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.entries.map((entry) => [entry.artist, entry.title, entry.originalLine])).toEqual([
      ['The Weeknd', 'Blinding Lights', 2],
      ['Arctic Monkeys', '505', 3],
      ['Radiohead', 'Creep', 4],
    ])
  })

  it('accepts reversed columns, uppercase headers, extra columns, and Unicode', () => {
    const parsed = parseCsvText(
      [' TITLE , year , ARTIST ', 'Şımarık,1997,Tarkan', 'Beggin\',2017,Måneskin'].join('\n'),
      { createId: ids() },
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.entries.map((entry) => [entry.artist, entry.title])).toEqual([
      ['Tarkan', 'Şımarık'],
      ['Måneskin', "Beggin'"],
    ])
  })

  it('reads quoted fields, including commas inside quotes', () => {
    const parsed = parseCsvText(
      'artist,title\n"Weeknd, The","Blinding Lights, Live"\n',
      { createId: ids() },
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.entries[0]).toMatchObject({
      artist: 'Weeknd, The',
      title: 'Blinding Lights, Live',
      issue: null,
    })
  })

  it('skips empty rows and reports incomplete ones', () => {
    const parsed = parseCsvText(['artist,title', '', 'The Weeknd,', ',Blinding Lights', 'Radiohead,Creep'].join('\n'), {
      createId: ids(),
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.entries.map((entry) => entry.issue)).toEqual([
      missingTitleMessage,
      missingArtistMessage,
      null,
    ])
    expect(parsed.entries[2]?.originalLine).toBe(5)
  })

  it('requires artist and title headers', () => {
    expect(parseCsvText('name,song\nThe Weeknd,Creep')).toEqual({
      ok: false,
      message: 'The CSV file needs artist and title columns.',
    })
  })

  it('strips a UTF-8 BOM and accepts CRLF rows', () => {
    const parsed = parseCsvText('\uFEFFartist,title\r\nAC/DC,Thunderstruck\r\n', { createId: ids() })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.entries[0]).toMatchObject({ artist: 'AC/DC', title: 'Thunderstruck', originalLine: 2 })
  })

  it('rejects a file with an unclosed quote', () => {
    expect(parseCsvText('artist,title\n"The Weeknd,Blinding Lights\n').ok).toBe(false)
  })
})
