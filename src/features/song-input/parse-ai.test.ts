import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseAiText } from './parse-ai.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AI song parsing', () => {
  it('turns a model list into review entries and keeps uncertainty visible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({
      songs: [
        { artist: 'The Weeknd', title: 'Blinding Lights', uncertain: false, note: '' },
        { artist: '', title: '', uncertain: true, note: 'This line does not name a song.' },
      ],
    })))

    const parsed = await parseAiText('blinding lights weekend\nand something else')

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) {
      return
    }
    expect(parsed.entries[0]).toMatchObject({
      source: 'ai',
      artist: 'The Weeknd',
      title: 'Blinding Lights',
      issue: null,
      originalLine: 1,
    })
    expect(parsed.entries[1]).toMatchObject({
      artist: '',
      title: '',
      issue: 'This line does not name a song.',
      originalLine: 2,
    })
  })

  it('sends only the song text', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(_input)).toBe('/api/parse-songs')
      expect(init?.body).toBe(JSON.stringify({ text: 'creep radiohead' }))
      return json({ songs: [] })
    })
    vi.stubGlobal('fetch', fetchImpl)

    const parsed = await parseAiText('  creep radiohead  ')

    expect(parsed).toEqual({ ok: false, message: 'No songs were found in this text.' })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('explains a rate limit without exposing the response body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: false, error: 'rate_limited', detail: 'secret' }, 429)))

    await expect(parseAiText('creep radiohead')).resolves.toEqual({
      ok: false,
      message: 'Too many lists were organized just now. Wait a moment and try again.',
    })
  })
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
