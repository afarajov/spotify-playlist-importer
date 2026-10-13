import { describe, expect, it } from 'vitest'
import { extractionRequest, normalizeSongText, readSongList } from './extract-songs.mjs'

const clearSong = {
  artist: 'The Weeknd',
  title: 'Blinding Lights',
  uncertain: false,
  note: '',
}

describe('song extraction contract', () => {
  it('sends only the user text to the small model, with strict JSON output', () => {
    const request = extractionRequest('blinding lights weekend')

    expect(request.model).toBe('gpt-6-luna')
    expect(request.reasoning).toEqual({ effort: 'none' })
    expect(request.input[0]).toMatchObject({ role: 'system' })
    expect(request.input[1]).toEqual({ role: 'user', content: 'blinding lights weekend' })
    expect(request.text.format).toMatchObject({ type: 'json_schema', strict: true, name: 'song_list' })
    expect(JSON.stringify(request)).not.toContain('spotify')
  })

  it('rejects an empty or oversized list before a model call', () => {
    expect(normalizeSongText('  blinding lights  ')).toBe('blinding lights')
    expect(() => normalizeSongText('   ')).toThrow(/empty_text/)
    expect(() => normalizeSongText('x'.repeat(100_001))).toThrow(/text_too_long/)
  })

  it('trims a clear song and keeps uncertainty when a field is missing', () => {
    expect(readSongList({ songs: [{ ...clearSong, artist: '  The Weeknd  ' }] })).toEqual([clearSong])
    expect(readSongList({
      songs: [{ artist: 'Coldplay', title: '   ', uncertain: false, note: '' }],
    })).toEqual([{
      artist: 'Coldplay',
      title: '',
      uncertain: true,
      note: 'Artist or title is missing.',
    }])
  })

  it('rejects a response that does not match the song list', () => {
    expect(() => readSongList({ songs: [{ artist: 'Ada', title: 'Song' }] })).toThrow(/invalid_model_response/)
    expect(() => readSongList({ songs: new Array(1001).fill(clearSong) })).toThrow(/invalid_model_response/)
    expect(() => readSongList(null)).toThrow(/invalid_model_response/)
  })
})
