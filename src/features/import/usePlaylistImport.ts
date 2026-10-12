import { useEffect, useMemo, useRef, useState } from 'react'
import { useSpotifyAuth } from '../auth/useSpotifyAuth.ts'
import { fetchCurrentAccount } from '../../services/spotify/profile.ts'
import { listMyPlaylists, listPlaylistTrackUris } from '../../services/spotify/playlists.ts'
import type { SpotifyAuthContextValue } from '../auth/auth-context.ts'
import type { EditablePlaylist, SongEntry, TrackMatch } from '../../shared/types/index.ts'
import { executeImport, importErrorMessage, markUncertainBatchesFailed, markUncertainCreationFailed, reconcileUncertainImport, retryFailedBatches } from './execute.ts'
import { readImportJournal, writeImportJournal } from './journal.ts'
import { countMatchBuckets, planImport, validateNewPlaylist, type DuplicatePolicy, type ImportPlan } from './plan.ts'
import { playlistPermissions } from './permissions.ts'
import type { ImportOperation } from './model.ts'

export function usePlaylistImport(entries: readonly SongEntry[], matches: Readonly<Record<string, TrackMatch>>) {
  const auth = useSpotifyAuth()
  const [playlists, setPlaylists] = useState<EditablePlaylist[]>([])
  const [hiddenCount, setHiddenCount] = useState(0)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [filter, setFilter] = useState('')
  const [destinationKind, setDestinationKind] = useState<'existing' | 'new'>('existing')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('private')
  const [formError, setFormError] = useState<string | null>(null)
  const [policy, setPolicy] = useState<DuplicatePolicy>('skip_existing')
  const [existingUris, setExistingUris] = useState<string[] | null>(null)
  const [duplicateState, setDuplicateState] = useState<'idle' | 'checking' | 'ready' | 'unavailable'>('idle')
  const [duplicateMessage, setDuplicateMessage] = useState<string | null>(null)
  const [operation, setOperation] = useState<ImportOperation | null>(() => readImportJournal())
  const confirmLock = useRef(false)
  const listRequest = useRef(0)
  const itemRequest = useRef(0)
  const permissions = playlistPermissions(auth.grantedScopes)
  const counts = useMemo(() => countMatchBuckets(entries, matches), [entries, matches])
  const selected = playlists.find((playlist) => playlist.id === selectedId) ?? null
  const plan = useMemo<ImportPlan>(() => {
    const knownUris = destinationKind === 'new' ? new Set<string>() : policy === 'skip_existing' && duplicateState === 'ready' ? new Set(existingUris ?? []) : null
    return planImport({
      entries,
      matches,
      policy: destinationKind === 'new' ? 'allow_duplicates' : policy,
      existingUris: destinationKind === 'new' ? new Set() : knownUris,
    })
  }, [destinationKind, duplicateState, entries, existingUris, matches, policy])

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.account) {
      return
    }
    const request = listRequest.current + 1
    listRequest.current = request
    let cancelled = false
    void (async () => {
      try {
        const page = await listMyPlaylists({ tokenSource: auth, offset: 0, ownerIds: await currentOwnerIds(auth) })
        if (cancelled || listRequest.current !== request) {
          return
        }
        setPlaylists(page.playlists)
        setHiddenCount(page.hiddenCount)
        setNextOffset(page.nextOffset)
        setListError(null)
      } catch (error) {
        if (cancelled || listRequest.current !== request) {
          return
        }
        setListError(importErrorMessage(error))
      } finally {
        if (!cancelled && listRequest.current === request) {
          setLoadingList(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [auth, auth.account, auth.isAuthenticated])

  function publish(next: ImportOperation) {
    setOperation(next)
    writeImportJournal(next)
  }

  async function loadPage(offset: number, replace: boolean, request: number) {
    setLoadingList(true)
    setListError(null)
    try {
      const page = await listMyPlaylists({
        tokenSource: auth,
        offset,
        ownerIds: await currentOwnerIds(auth),
      })
      if (listRequest.current !== request) {
        return
      }
      setPlaylists((current) => (replace ? page.playlists : dedupePlaylists([...current, ...page.playlists])))
      setHiddenCount((current) => (replace ? page.hiddenCount : current + page.hiddenCount))
      setNextOffset(page.nextOffset)
    } catch (error) {
      if (listRequest.current !== request) {
        return
      }
      setListError(importErrorMessage(error))
    } finally {
      if (listRequest.current === request) {
        setLoadingList(false)
      }
    }
  }

  function loadMore() {
    if (!auth.account || nextOffset === null || loadingList) {
      return
    }
    const request = listRequest.current + 1
    listRequest.current = request
    void loadPage(nextOffset, false, request)
  }

  function reload() {
    if (!auth.account) {
      return
    }
    const request = listRequest.current + 1
    listRequest.current = request
    void loadPage(0, true, request)
  }

  async function inspectPlaylist(playlistId: string, nextPolicy: DuplicatePolicy) {
    const request = itemRequest.current + 1
    itemRequest.current = request
    if (nextPolicy === 'allow_duplicates') {
      setExistingUris(null)
      setDuplicateState('ready')
      setDuplicateMessage(null)
      return
    }
    setDuplicateState('checking')
    setDuplicateMessage(null)
    try {
      const uris = await listPlaylistTrackUris({ tokenSource: auth, playlistId })
      if (itemRequest.current !== request) {
        return
      }
      setExistingUris(uris)
      setDuplicateState('ready')
    } catch (error) {
      if (itemRequest.current !== request) {
        return
      }
      setExistingUris(null)
      setDuplicateState('unavailable')
      setDuplicateMessage(
        error instanceof Error && importErrorMessage(error).includes('refused')
          ? 'Spotify did not allow this playlist to be read. Duplicate checking is unavailable.'
          : 'The songs already in this playlist could not be checked.',
      )
    }
  }

  function selectPlaylist(playlistId: string) {
    setSelectedId(playlistId)
    setFormError(null)
    void inspectPlaylist(playlistId, policy)
  }

  function changePolicy(next: DuplicatePolicy) {
    setPolicy(next)
    setFormError(null)
    if (selectedId) {
      void inspectPlaylist(selectedId, next)
    }
  }

  function acceptUncheckedImport() {
    setPolicy('allow_duplicates')
    setDuplicateState('ready')
    setDuplicateMessage(null)
    setFormError(null)
  }

  function validateDestination(): boolean {
    if (!permissions.canModify) {
      setFormError('This Spotify connection cannot change playlists. Connect again to grant playlist permissions. Your song list stays on this device.')
      return false
    }
    if (destinationKind === 'new') {
      const validated = validateNewPlaylist({ name, description, visibility })
      if (!validated.ok) {
        setFormError(validated.message)
        return false
      }
      if (validated.draft.visibility === 'public' && !permissions.canCreatePublic) {
        setFormError('This connection cannot create public playlists. Connect again, or keep the playlist private.')
        return false
      }
      if (validated.draft.visibility === 'private' && !permissions.canCreatePrivate) {
        setFormError('This connection cannot create private playlists. Connect again, or make the playlist public.')
        return false
      }
      setFormError(null)
      return true
    }
    if (!selected) {
      setFormError('Choose a playlist.')
      return false
    }
    if (policy === 'skip_existing' && duplicateState !== 'ready') {
      setFormError(duplicateMessage ?? 'Duplicate checking is still running.')
      return false
    }
    setFormError(null)
    return true
  }

  async function confirmImport() {
    if (confirmLock.current || !validateDestination() || plan.blocked || plan.ready.length === 0) {
      return
    }
    confirmLock.current = true
    const validated = destinationKind === 'new' ? validateNewPlaylist({ name, description, visibility }) : null
    const destination = destinationKind === 'new' && validated && validated.ok
      ? { kind: 'new' as const, name: validated.draft.name, description: validated.draft.description, visibility: validated.draft.visibility }
      : selected
        ? { kind: 'existing' as const, playlistId: selected.id, name: selected.name, ownerName: selected.ownerName, externalUrl: selected.externalUrl }
        : null
    if (!destination) {
      confirmLock.current = false
      return
    }
    const activePolicy = destination.kind === 'new' ? 'allow_duplicates' : policy
    const frozen = planImport({
      entries,
      matches,
      policy: activePolicy,
      existingUris: activePolicy === 'skip_existing' ? new Set(existingUris ?? []) : new Set(),
    })
    const next: ImportOperation = {
      id: crypto.randomUUID(),
      phase: 'importing',
      creation: destination.kind === 'new' ? 'pending' : 'not_needed',
      destination,
      playlistId: destination.kind === 'existing' ? destination.playlistId : null,
      playlistUrl: destination.kind === 'existing' ? destination.externalUrl : null,
      playlistName: destination.name,
      policy: activePolicy,
      tracks: frozen.tracks,
      skippedExisting: frozen.skippedExisting,
      unresolvedCount: counts.unresolvedCount,
      inputCount: counts.inputCount,
      needsReviewCount: counts.needsReviewCount,
      notFoundCount: counts.notFoundCount,
      baselineTrackUris: activePolicy === 'skip_existing' ? [...(existingUris ?? [])] : null,
      batches: frozen.batches.map((batch, index) => ({
        index,
        songIds: batch.map((track) => track.songId),
        uris: batch.map((track) => track.uri),
        phase: 'pending',
        snapshotId: null,
        message: null,
      })),
      message: null,
    }
    publish(next)
    try {
      if (next.tracks.length === 0) {
        publish({ ...next, phase: 'completed' })
        return
      }
      await executeImport(next, { tokenSource: auth }, publish)
    } finally {
      confirmLock.current = false
    }
  }

  async function retry() {
    if (!operation || confirmLock.current) {
      return
    }
    confirmLock.current = true
    try {
      await retryFailedBatches(operation, { tokenSource: auth }, publish)
    } finally {
      confirmLock.current = false
    }
  }

  async function checkPlaylist() {
    if (!operation || confirmLock.current) {
      return
    }
    confirmLock.current = true
    try {
      await reconcileUncertainImport(operation, { tokenSource: auth }, publish)
    } finally {
      confirmLock.current = false
    }
  }

  function allowCreateAgain() {
    if (!operation) {
      return
    }
    publish(markUncertainCreationFailed(operation))
  }

  function allowBatchAgain() {
    if (!operation) {
      return
    }
    publish(markUncertainBatchesFailed(operation))
  }

  function reset() {
    if (operation && (operation.phase === 'importing' || operation.phase === 'creating_playlist')) {
      return
    }
    setOperation(null)
    writeImportJournal(null)
  }

  return {
    auth,
    permissions,
    playlists,
    visiblePlaylists: playlists.filter((playlist) => playlist.name.toLowerCase().includes(filter.trim().toLowerCase())),
    hiddenCount,
    nextOffset,
    listError,
    loadingList,
    filter,
    setFilter,
    destinationKind,
    setDestinationKind,
    selected,
    name,
    setName,
    description,
    setDescription,
    visibility,
    setVisibility,
    formError,
    policy,
    duplicateState,
    duplicateMessage,
    counts,
    plan,
    operation,
    loadMore,
    reload,
    selectPlaylist,
    changePolicy,
    acceptUncheckedImport,
    validateDestination,
    confirmImport,
    retry,
    checkPlaylist,
    allowCreateAgain,
    allowBatchAgain,
    reset,
  }
}

async function currentOwnerIds(auth: SpotifyAuthContextValue): Promise<string[]> {
  const ids = new Set<string>()
  if (auth.account?.accountId) {
    ids.add(auth.account.accountId)
  }
  if (auth.account?.userId) {
    ids.add(auth.account.userId)
    return [...ids]
  }
  try {
    const fresh = await fetchCurrentAccount(auth)
    ids.add(fresh.accountId)
    if (fresh.userId) {
      ids.add(fresh.userId)
    }
  } catch {
    // A stored account id still matches playlists that already use account_id.
  }
  return [...ids]
}

function dedupePlaylists(playlists: readonly EditablePlaylist[]): EditablePlaylist[] {
  const seen = new Set<string>()
  return playlists.filter((playlist) => {
    if (seen.has(playlist.id)) {
      return false
    }
    seen.add(playlist.id)
    return true
  })
}
