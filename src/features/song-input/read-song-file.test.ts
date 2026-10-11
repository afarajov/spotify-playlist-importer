import { describe, expect, it } from 'vitest'
import { MAX_SONG_FILE_BYTES } from './limits.ts'
import { decodeUtf8, readSongFile } from './read-song-file.ts'

describe('song file reading', () => {
  it('decodes UTF-8 and rejects a byte sequence that is not UTF-8', () => {
    expect(decodeUtf8(new TextEncoder().encode('Måneskin - Beggin\''))).toEqual({
      ok: true,
      text: 'Måneskin - Beggin\'',
    })
    expect(decodeUtf8(new Uint8Array([0xff, 0xfe]))).toMatchObject({ ok: false })
  })

  it('rejects an unsupported type, an empty file, and a file over 1 MB', async () => {
    await expect(readSongFile(new File(['a'], 'songs.md'))).resolves.toMatchObject({
      ok: false,
      message: 'Use a .txt or .csv file.',
    })
    await expect(readSongFile(new File([], 'songs.txt'))).resolves.toMatchObject({
      ok: false,
      message: 'This file is empty.',
    })
    await expect(readSongFile(new File([new Uint8Array(MAX_SONG_FILE_BYTES + 1)], 'songs.txt'))).resolves.toMatchObject({
      ok: false,
      message: 'This file is larger than 1 MB.',
    })
  })

  it('reads a text file without changing its contents', async () => {
    const text = 'The Weeknd - Blinding Lights\n'
    await expect(readSongFile(new File([text], 'songs.TXT', { type: 'text/plain' }))).resolves.toEqual({
      ok: true,
      kind: 'txt',
      fileName: 'songs.TXT',
      text,
    })
  })
})
