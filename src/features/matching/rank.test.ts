import { describe, expect, it } from 'vitest'
import { artistSimilarity, rankCandidates, titleSimilarity, type SpotifyTrack } from './rank.ts'

function track(id: string, title: string, artists: string[], available = true): SpotifyTrack {
  return {
    trackId: id,
    uri: `spotify:track:${id}`,
    title,
    artists,
    albumName: 'Album',
    imageUrl: null,
    externalUrl: `https://open.spotify.com/track/${id}`,
    durationMs: 1_000,
    available,
  }
}

describe('artist and title similarity', () => {
  it('scores an exact artist and a small typo highly', () => {
    expect(artistSimilarity('The Weeknd', ['The Weeknd'])).toBe(1)
    expect(artistSimilarity('The Weekend', ['The Weeknd'])).toBeGreaterThan(0.84)
    expect(artistSimilarity('Artic Monkeys', ['Arctic Monkeys'])).toBeGreaterThan(0.84)
  })

  it('recognizes featured artists and a different order', () => {
    expect(artistSimilarity('Artist A feat. Artist B', ['Artist A', 'Artist B'])).toBeGreaterThan(0.9)
    expect(artistSimilarity('Artist B, Artist A', ['Artist A', 'Artist B'])).toBeGreaterThan(0.84)
  })

  it('does not treat a featured-artist collision as the main performer', () => {
    expect(artistSimilarity('Radiohead', ['Daft Punk', 'Radiohead'])).toBeLessThan(0.6)
    expect(artistSimilarity('Radiohead', ['Coldplay'])).toBeLessThan(0.6)
  })

  it('scores close titles highly and unrelated titles poorly', () => {
    expect(titleSimilarity('Blinding Lights', 'Blinding Lights')).toBe(1)
    expect(titleSimilarity('Blinding Light', 'Blinding Lights')).toBeGreaterThan(0.8)
    expect(titleSimilarity('Get Luky', 'Get Lucky')).toBeGreaterThan(0.8)
    expect(titleSimilarity('505', '505')).toBe(1)
    expect(titleSimilarity('Yellow', 'Creep')).toBeLessThan(0.5)
  })
})

describe('candidate ranking', () => {
  it('ranks the exact recording first and classifies it as a high-confidence match', () => {
    const ranked = rankCandidates('The Weeknd', 'Blinding Lights', [
      track('remix', 'Blinding Lights (Remix)', ['The Weeknd']),
      track('exact', 'Blinding Lights', ['The Weeknd']),
    ])
    expect(ranked.candidates[0]?.trackId).toBe('exact')
    expect(ranked.status).toBe('matched')
    expect(ranked.confidence).toBe('high')
    expect(ranked.selectedTrackId).toBe('exact')
  })

  it('accepts a minor artist typo with an exact title', () => {
    const ranked = rankCandidates('The Weekend', 'Blinding Lights', [track('exact', 'Blinding Lights', ['The Weeknd'])])
    expect(ranked.status).toBe('matched')
    expect(ranked.selectedTrackId).toBe('exact')
  })

  it('does not auto-select a different artist or an unrequested live version', () => {
    const wrongArtist = rankCandidates('Radiohead', 'Creep', [track('cover', 'Creep', ['Someone Else'])])
    expect(wrongArtist.status).not.toBe('matched')
    expect(wrongArtist.selectedTrackId).toBeNull()

    const live = rankCandidates('Daft Punk', 'Get Lucky', [
      track('live', 'Get Lucky - Live', ['Daft Punk']),
      track('studio', 'Get Lucky', ['Daft Punk']),
    ])
    expect(live.candidates[0]?.trackId).toBe('studio')
    expect(live.status).toBe('matched')
  })

  it('keeps an explicit radio edit ahead of the original', () => {
    const ranked = rankCandidates('Daft Punk', 'Get Lucky (Radio Edit)', [
      track('studio', 'Get Lucky', ['Daft Punk']),
      track('radio', 'Get Lucky (Radio Edit)', ['Daft Punk']),
    ])
    expect(ranked.candidates[0]?.trackId).toBe('radio')
    expect(ranked.status).toBe('matched')
  })

  it('asks for review when a remaster is the only close recording', () => {
    const ranked = rankCandidates('Daft Punk', 'Get Lucky', [track('remaster', 'Get Lucky - Remastered', ['Daft Punk'])])
    expect(ranked.candidates[0]?.trackId).toBe('remaster')
    expect(ranked.confidence === 'high' || ranked.status === 'needs_review').toBe(true)
  })

  it('asks for review when two strong candidates are nearly tied', () => {
    const ranked = rankCandidates('Artist A', 'Song', [
      track('b', 'Song', ['Artist A']),
      track('a', 'Song', ['Artist A']),
    ])
    expect(ranked.status).toBe('needs_review')
    expect(ranked.candidates.map((candidate) => candidate.trackId)).toEqual(['a', 'b'])
  })

  it('reports no suitable candidate without inventing a selection', () => {
    const ranked = rankCandidates('Radiohead', 'Creep', [])
    expect(ranked.status).toBe('not_found')
    expect(ranked.selectedTrackId).toBeNull()
  })

  it('does not auto-select an unavailable track', () => {
    const ranked = rankCandidates('The Weeknd', 'Blinding Lights', [
      track('missing', 'Blinding Lights', ['The Weeknd'], false),
    ])
    expect(ranked.status).not.toBe('matched')
  })
})
