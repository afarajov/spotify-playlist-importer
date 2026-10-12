import { describe, expect, it } from 'vitest'
import { normalizeForCompare, splitArtists } from './normalize.ts'
import { stringSimilarity } from './similarity.ts'

describe('text normalization', () => {
  it('treats case, spacing, and apostrophes as the same text', () => {
    expect(normalizeForCompare(' THE  WEEKND ')).toBe('the weeknd')
    expect(normalizeForCompare('Beggin’')).toBe(normalizeForCompare("Beggin'"))
  })

  it('removes diacritics without dropping non-latin letters', () => {
    expect(normalizeForCompare('Måneskin')).toBe('maneskin')
    expect(normalizeForCompare('Şımarık')).toBe('simarik')
    expect(normalizeForCompare('Привет')).toBe('привет')
  })

  it('keeps short and numeric titles intact', () => {
    expect(normalizeForCompare('505')).toBe('505')
    expect(normalizeForCompare('I')).toBe('i')
    expect(stringSimilarity('505', '50')).toBeLessThan(0.8)
    expect(stringSimilarity('505', '505')).toBe(1)
  })

  it('treats punctuation and hyphen variants as spacing', () => {
    expect(normalizeForCompare('AC/DC')).toBe('ac dc')
    expect(normalizeForCompare('AC–DC')).toBe(normalizeForCompare('AC-DC'))
    expect(stringSimilarity('AC/DC', 'AC DC')).toBe(1)
  })

  it('splits featured artists without splitting a band name that uses and', () => {
    expect(splitArtists('Artist A feat. Artist B')).toEqual(['artist a', 'artist b'])
    expect(splitArtists('Florence and the Machine')).toEqual(['florence and the machine'])
  })
})
