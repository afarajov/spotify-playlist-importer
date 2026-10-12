import { describe, expect, it, vi } from 'vitest'
import { buildImportBatches } from './plan.ts'
import { executeImport, markUncertainBatchesFailed, retryFailedBatches } from './execute.ts'
import type { ImportOperation } from './model.ts'

const tokenSource = {
  getValidAccessToken: async () => 'access-token',
  forceRefreshAccessToken: async () => 'refreshed-token',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function operation(count: number, overrides: Partial<ImportOperation> = {}): ImportOperation {
  const tracks = Array.from({ length: count }, (_, index) => ({
    songId: `song-${index}`,
    position: index + 1,
    trackId: `t${index}`,
    uri: `spotify:track:t${index}`,
  }))
  return {
    id: `op-${count}-${overrides.playlistId ?? 'playlist1'}`,
    phase: 'importing',
    creation: 'not_needed',
    destination: { kind: 'existing', playlistId: 'playlist1', name: 'Mine', ownerName: 'Ada', externalUrl: 'https://open.spotify.com/playlist/playlist1' },
    playlistId: 'playlist1',
    playlistUrl: 'https://open.spotify.com/playlist/playlist1',
    playlistName: 'Mine',
    policy: 'allow_duplicates',
    tracks,
    skippedExisting: [],
    unresolvedCount: 0,
    inputCount: count,
    needsReviewCount: 0,
    notFoundCount: 0,
    baselineTrackUris: [],
    batches: buildImportBatches(tracks).map((batch, index) => ({
      index,
      songIds: batch.map((track) => track.songId),
      uris: batch.map((track) => track.uri),
      phase: 'pending' as const,
      snapshotId: null,
      message: null,
    })),
    message: null,
    ...overrides,
  }
}

describe('batch importing', () => {
  it('adds batches sequentially through the items endpoint and keeps order', async () => {
    const calls: string[][] = []
    let active = 0
    let maxActive = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      const url = new URL(String(input))
      expect(url.pathname).toBe('/v1/playlists/playlist1/items')
      expect(init?.method).toBe('POST')
      const body = JSON.parse(String(init?.body)) as { uris: string[] }
      calls.push(body.uris)
      await Promise.resolve()
      active -= 1
      return jsonResponse({ snapshot_id: `snap-${calls.length}` }, 201)
    })

    const result = await executeImport(operation(250), { tokenSource, fetchImpl: fetchImpl as typeof fetch }, () => {})
    expect(result.phase).toBe('completed')
    expect(calls.map((uris) => uris.length)).toEqual([100, 100, 50])
    expect(calls[0]?.[0]).toBe('spotify:track:t0')
    expect(calls[2]?.[49]).toBe('spotify:track:t249')
    expect(maxActive).toBe(1)
    expect(result.batches.every((batch) => batch.snapshotId)).toBe(true)
  })

  it('does not resend a confirmed batch or an uncertain batch', async () => {
    let posts = 0
    let failOnce = true
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts += 1
        if (failOnce && posts === 2) {
          failOnce = false
          throw new TypeError('socket closed')
        }
        return jsonResponse({ snapshot_id: `snap-${posts}` }, 201)
      }
      return jsonResponse({ items: [], total: 0 })
    })
    const deps = { tokenSource, fetchImpl: fetchImpl as typeof fetch }
    const first = await executeImport(operation(250, { id: 'partial' }), deps, () => {})
    expect(first.phase).toBe('needs_reconciliation')
    expect(first.batches.map((batch) => batch.phase)).toEqual(['succeeded', 'uncertain', 'pending'])
    posts = 0
    const retried = await retryFailedBatches(first, deps, () => {})
    expect(posts).toBe(0)
    expect(retried.batches[0]?.phase).toBe('succeeded')
    const allowed = markUncertainBatchesFailed(retried)
    const recovered = await retryFailedBatches(allowed, deps, () => {})
    expect(recovered.batches.map((batch) => batch.phase)).toEqual(['succeeded', 'succeeded', 'succeeded'])
    expect(posts).toBe(2)
  })

  it('refuses a second import while one is running and stops on quota', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let posts = 0
    const fetchImpl = vi.fn(async () => {
      posts += 1
      await gate
      return jsonResponse({ snapshot_id: 'snap' }, 201)
    })
    const running = executeImport(operation(1, { id: 'locked' }), { tokenSource, fetchImpl: fetchImpl as typeof fetch }, () => {})
    const ignored = await executeImport(operation(1, { id: 'other' }), { tokenSource, fetchImpl: fetchImpl as typeof fetch }, () => {})
    expect(ignored.id).toBe('other')
    release()
    await running
    expect(posts).toBe(1)

    const quota = vi.fn(async () => jsonResponse({ error: { reason: 'QUOTA_EXCEEDED' } }, 429))
    const stopped = await executeImport(operation(150, { id: 'quota', playlistId: 'playlist2' }), { tokenSource, fetchImpl: quota as typeof fetch }, () => {})
    expect(stopped.phase).toBe('failed')
    expect(stopped.batches[0]?.phase).toBe('failed')
    expect(stopped.batches[1]?.phase).toBe('pending')
    expect(quota).toHaveBeenCalledTimes(1)
  })

  it('does not create a playlist again when creation is uncertain', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('timed out')
    })
    const created = operation(1, {
      id: 'create',
      playlistId: null,
      playlistUrl: null,
      creation: 'pending',
      destination: { kind: 'new', name: 'Night', description: '', visibility: 'private' },
      baselineTrackUris: null,
    })
    const first = await executeImport(created, { tokenSource, fetchImpl: fetchImpl as typeof fetch }, () => {})
    expect(first.phase).toBe('needs_reconciliation')
    expect(first.creation).toBe('uncertain')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const second = await executeImport(first, { tokenSource, fetchImpl: fetchImpl as typeof fetch }, () => {})
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(second.playlistId).toBeNull()
  })
})
