import { describe, expect, it } from 'vitest'
import type { SongEntry, TrackMatch } from '../../shared/types/index.ts'
import { buildImportBatches, planImport, validateNewPlaylist } from './plan.ts'

function entry(id: string, issue: string | null = null): SongEntry {
  return { id, source: 'manual', originalText: `${id} - Song`, originalLine: Number(id), artist: 'Artist', title: `Song ${id}`, issue }
}

function readyMatch(uri: string, status: TrackMatch['status'] = 'matched'): TrackMatch {
  return {
    status,
    candidates: [{
      trackId: uri.slice('spotify:track:'.length),
      uri,
      title: 'Song',
      artists: ['Artist'],
      albumName: 'Album',
      imageUrl: null,
      externalUrl: null,
      durationMs: 1000,
      available: true,
      score: 90,
      confidence: 'high',
      versionLabels: [],
    }],
    selectedTrackId: uri.slice('spotify:track:'.length),
    confidence: status === 'matched' ? 'high' : 'medium',
    score: 90,
    confirmation: status === 'needs_review' ? 'unreviewed' : 'unreviewed',
    manuallySelected: false,
    errorMessage: null,
    queryArtist: 'Artist',
    queryTitle: 'Song',
  }
}

describe('import planning', () => {
  it('keeps input order, drops unresolved songs, and keeps intentional repeats', () => {
    const entries = [entry('1'), entry('2', 'Missing title'), entry('3'), entry('4')]
    const matches = {
      '1': readyMatch('spotify:track:aaa'),
      '3': readyMatch('spotify:track:bbb', 'needs_review'),
      '4': readyMatch('spotify:track:aaa'),
    }
    const plan = planImport({ entries, matches, policy: 'allow_duplicates', existingUris: new Set(['spotify:track:bbb']) })
    expect(plan.tracks.map((track) => track.uri)).toEqual(['spotify:track:aaa', 'spotify:track:aaa'])
    expect(plan.ready.map((track) => track.position)).toEqual([1, 4])
  })

  it('skips tracks already in the playlist without removing new repeats', () => {
    const entries = [entry('1'), entry('2'), entry('3')]
    const matches = {
      '1': readyMatch('spotify:track:aaa'),
      '2': readyMatch('spotify:track:bbb'),
      '3': readyMatch('spotify:track:bbb'),
    }
    const skipped = planImport({ entries, matches, policy: 'skip_existing', existingUris: new Set(['spotify:track:aaa']) })
    expect(skipped.skippedExisting.map((track) => track.songId)).toEqual(['1'])
    expect(skipped.tracks.map((track) => track.uri)).toEqual(['spotify:track:bbb', 'spotify:track:bbb'])
    const blocked = planImport({ entries, matches, policy: 'skip_existing', existingUris: null })
    expect(blocked.blocked).toBe(true)
    expect(blocked.tracks).toEqual([])
  })

  it('builds batches of at most 100 in order', () => {
    const tracks = Array.from({ length: 1000 }, (_, index) => ({ songId: String(index), position: index + 1, trackId: `t${index}`, uri: `spotify:track:t${index}` }))
    expect(buildImportBatches(tracks.slice(0, 1))).toHaveLength(1)
    expect(buildImportBatches(tracks.slice(0, 10))).toHaveLength(1)
    expect(buildImportBatches(tracks.slice(0, 100))).toHaveLength(1)
    expect(buildImportBatches(tracks.slice(0, 101)).map((batch) => batch.length)).toEqual([100, 1])
    expect(buildImportBatches(tracks.slice(0, 250)).map((batch) => batch.length)).toEqual([100, 100, 50])
    const thousand = buildImportBatches(tracks)
    expect(thousand).toHaveLength(10)
    expect(thousand[0]?.[0]?.uri).toBe('spotify:track:t0')
    expect(thousand[9]?.[99]?.uri).toBe('spotify:track:t999')
    expect(buildImportBatches([])).toEqual([])
  })

  it('trims a playlist name without changing the words', () => {
    expect(validateNewPlaylist({ name: '  Night  Drive  ', description: '  Late  ', visibility: 'private' })).toEqual({
      ok: true,
      draft: { name: 'Night  Drive', description: 'Late', visibility: 'private' },
    })
    expect(validateNewPlaylist({ name: '   ', description: '', visibility: 'public' })).toMatchObject({ ok: false })
    expect(validateNewPlaylist({ name: 'Night', description: '', visibility: 'secret' })).toMatchObject({ ok: false })
    expect(validateNewPlaylist({ name: 'n'.repeat(101), description: '', visibility: 'private' })).toMatchObject({ ok: false })
  })
})
