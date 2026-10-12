import { useEffect, useState } from 'react'
import type { SongEntry, TrackMatch, WorkflowStage } from '../../shared/types/index.ts'
import { addedCount, failedCount, uncertainCount } from './model.ts'
import { usePlaylistImport } from './usePlaylistImport.ts'

type ImportPanelProps = {
  entries: readonly SongEntry[]
  matches: Readonly<Record<string, TrackMatch>>
  onBack: () => void
  onWorkflowStage?: (stage: WorkflowStage) => void
}

export function ImportPanel({ entries, matches, onBack, onWorkflowStage }: ImportPanelProps) {
  const importer = usePlaylistImport(entries, matches)
  const [reviewing, setReviewing] = useState(false)
  const operation = importer.operation
  const screen = operation
    ? operation.phase === 'creating_playlist' || operation.phase === 'importing'
      ? 'progress'
      : 'results'
    : reviewing
      ? 'preview'
      : 'destination'
  const busy = screen === 'progress'

  useEffect(() => {
    onWorkflowStage?.(screen === 'destination' ? 'choose_playlist' : 'import')
  }, [onWorkflowStage, screen])

  return (
    <section aria-label="Playlist import" className="mt-5 rounded-[28px] border border-line bg-panel p-4 shadow-[0_30px_80px_-48px_rgb(0_0_0/0.9)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.02em]">
            {screen === 'destination' ? 'Choose a playlist' : screen === 'preview' ? 'Review import' : screen === 'progress' ? 'Importing songs' : 'Import results'}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            {screen === 'destination'
              ? 'Songs are added only after you confirm. Existing playlist contents stay in place.'
              : 'This adds songs to Spotify. Nothing is removed or reordered.'}
          </p>
        </div>
        {busy ? null : (
          <button type="button" onClick={screen === 'preview' ? () => setReviewing(false) : onBack} className={secondaryButtonClass}>
            {screen === 'preview' ? 'Back' : 'Back to songs'}
          </button>
        )}
      </div>

      {screen === 'destination' ? <DestinationStep importer={importer} onReview={() => {
        if (importer.validateDestination()) {
          setReviewing(true)
        }
      }} /> : null}
      {screen === 'preview' ? <PreviewStep importer={importer} /> : null}
      {screen === 'progress' && operation ? <ProgressStep operation={operation} /> : null}
      {screen === 'results' && operation ? <ResultsStep importer={importer} onImportAgain={() => {
        importer.reset()
        setReviewing(false)
      }} /> : null}
    </section>
  )
}

function DestinationStep({ importer, onReview }: { importer: ReturnType<typeof usePlaylistImport>; onReview: () => void }) {
  const { permissions } = importer
  return (
    <div className="mt-4">
      {permissions.known && !permissions.canModify ? (
        <div className="mb-4 rounded-2xl border border-line bg-field/60 p-3">
          <p className="text-sm leading-6 text-spot">This Spotify connection cannot change playlists. Connect again to grant playlist permissions. Your song list stays on this device.</p>
          <button type="button" onClick={() => void importer.auth.connect()} className={`${primaryButtonClass} mt-3`}>Connect again</button>
        </div>
      ) : null}
      <div
        role="radiogroup"
        aria-label="Playlist destination"
        className="grid grid-cols-2 rounded-full bg-field p-1 ring-1 ring-line ring-inset"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
            return
          }
          event.preventDefault()
          importer.setDestinationKind(importer.destinationKind === 'existing' ? 'new' : 'existing')
        }}
      >
        <DestinationTab selected={importer.destinationKind === 'existing'} label="Existing playlist" onSelect={() => importer.setDestinationKind('existing')} />
        <DestinationTab selected={importer.destinationKind === 'new'} label="New playlist" onSelect={() => importer.setDestinationKind('new')} />
      </div>
      {importer.destinationKind === 'existing' ? <ExistingPlaylists importer={importer} /> : <NewPlaylistForm importer={importer} />}
      {importer.formError ? <p role="alert" className="mt-3 text-sm leading-5 text-spot">{importer.formError}</p> : null}
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onReview} disabled={!permissions.canModify || importer.plan.ready.length === 0} className={primaryButtonClass}>
          Review import
        </button>
      </div>
    </div>
  )
}

function DestinationTab({ selected, label, onSelect }: { selected: boolean; label: string; onSelect: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect} className={`h-11 rounded-full px-3 text-sm font-semibold ${selected ? 'bg-accent text-accent-ink' : 'text-muted hover:text-text'}`}>
      {label}
    </button>
  )
}

function ExistingPlaylists({ importer }: { importer: ReturnType<typeof usePlaylistImport> }) {
  return (
    <div className="mt-4">
      <label className="block text-xs text-muted">
        Filter loaded playlists
        <input value={importer.filter} onChange={(event) => importer.setFilter(event.target.value)} className={fieldClass} />
      </label>
      {importer.nextOffset !== null ? <p className="mt-2 text-xs leading-5 text-faint">This filter checks playlists loaded so far.</p> : null}
      {importer.hiddenCount > 0 ? <p className="mt-2 text-xs leading-5 text-faint">{importer.hiddenCount} followed {importer.hiddenCount === 1 ? 'playlist is' : 'playlists are'} hidden because Spotify does not show them as editable.</p> : null}
      {importer.listError ? (
        <div className="mt-3">
          <p role="alert" className="text-sm leading-5 text-spot">{importer.listError}</p>
          <button type="button" onClick={importer.reload} className={`${secondaryButtonClass} mt-2`}>Try again</button>
        </div>
      ) : null}
      {importer.loadingList && importer.playlists.length === 0 ? <p className="mt-3 text-sm text-muted">Loading playlists…</p> : null}
      {!importer.loadingList && !importer.listError && importer.playlists.length === 0 ? <p className="mt-3 text-sm text-muted">No editable playlists were found.</p> : null}
      <ul className="mt-3 space-y-2" aria-label="Editable playlists">
        {importer.visiblePlaylists.map((playlist) => {
          const selected = importer.selected?.id === playlist.id
          return (
            <li key={playlist.id} className="flex items-center gap-2">
              <button type="button" aria-pressed={selected} onClick={() => importer.selectPlaylist(playlist.id)} className={`flex min-w-0 flex-1 items-center gap-3 rounded-2xl border px-3 py-2 text-left ${selected ? 'border-accent bg-accent/10' : 'border-line hover:border-line-strong'}`}>
                {playlist.imageUrl ? <img src={playlist.imageUrl} alt="" width={40} height={40} className="size-10 shrink-0 rounded-lg bg-ink object-contain" /> : <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-ink text-[10px] text-faint">No art</span>}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{playlist.name}</span>
                  <span className="block truncate text-xs text-muted">{playlistMeta(playlist)}</span>
                </span>
              </button>
              {playlist.externalUrl ? <a href={playlist.externalUrl} target="_blank" rel="noreferrer" className="shrink-0 px-1 text-xs text-muted underline-offset-2 hover:text-text hover:underline">Open</a> : null}
            </li>
          )
        })}
      </ul>
      {importer.nextOffset !== null ? (
        <button type="button" onClick={importer.loadMore} disabled={importer.loadingList} className={`${secondaryButtonClass} mt-3`}>
          {importer.loadingList ? 'Loading…' : 'Load more playlists'}
        </button>
      ) : null}
      {importer.selected ? <DuplicatePolicy importer={importer} /> : null}
    </div>
  )
}

function DuplicatePolicy({ importer }: { importer: ReturnType<typeof usePlaylistImport> }) {
  return (
    <fieldset className="mt-4 rounded-2xl border border-line p-3">
      <legend className="px-1 text-sm font-medium">Songs already in this playlist</legend>
      <p className="mt-1 text-xs leading-5 text-faint">Repeated songs in your list stay repeated. This setting only skips tracks that are already in the playlist.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <PolicyOption checked={importer.policy === 'skip_existing'} label="Skip songs already in playlist" onSelect={() => importer.changePolicy('skip_existing')} />
        <PolicyOption checked={importer.policy === 'allow_duplicates'} label="Allow duplicates" onSelect={() => importer.changePolicy('allow_duplicates')} />
      </div>
      {importer.duplicateState === 'checking' ? <p className="mt-2 text-sm text-muted">Checking songs already in the playlist…</p> : null}
      {importer.duplicateState === 'unavailable' ? (
        <div className="mt-2">
          <p className="text-sm leading-5 text-spot">{importer.duplicateMessage}</p>
          <button type="button" onClick={importer.acceptUncheckedImport} className={`${secondaryButtonClass} mt-2`}>Import without duplicate checking</button>
        </div>
      ) : null}
      {importer.selected && !importer.selected.canModify ? <p className="mt-2 text-xs leading-5 text-faint">Collaborative playlist. Spotify still has to allow the change, so edit access is not guaranteed.</p> : null}
    </fieldset>
  )
}

function PolicyOption({ checked, label, onSelect }: { checked: boolean; label: string; onSelect: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onSelect} className={`h-11 rounded-2xl border px-3 text-left text-sm ${checked ? 'border-accent bg-accent/10 text-text' : 'border-line text-muted'}`}>
      {label}
    </button>
  )
}

function NewPlaylistForm({ importer }: { importer: ReturnType<typeof usePlaylistImport> }) {
  return (
    <div className="mt-4 grid gap-3">
      <label className="text-xs text-muted">
        Playlist name
        <input value={importer.name} onChange={(event) => importer.setName(event.target.value)} className={fieldClass} />
      </label>
      <label className="text-xs text-muted">
        Description
        <textarea value={importer.description} onChange={(event) => importer.setDescription(event.target.value)} rows={3} className={`${fieldClass} h-auto py-2`} placeholder="Optional" />
      </label>
      <fieldset>
        <legend className="text-xs text-muted">Visibility</legend>
        <p className="mt-1 text-xs leading-5 text-faint">Private playlists stay off your profile. Public playlists can appear on your Spotify profile. The playlist is created only when you confirm the import.</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <PolicyOption checked={importer.visibility === 'private'} label="Private" onSelect={() => importer.setVisibility('private')} />
          <PolicyOption checked={importer.visibility === 'public'} label="Public" onSelect={() => importer.setVisibility('public')} />
        </div>
      </fieldset>
    </div>
  )
}

function PreviewStep({ importer }: { importer: ReturnType<typeof usePlaylistImport> }) {
  const destination = importer.destinationKind === 'new'
    ? validatePreviewName(importer.name)
    : importer.selected?.name ?? 'Playlist'
  const count = importer.plan.tracks.length
  const label = importer.destinationKind === 'new'
    ? `Create playlist and import ${count} ${count === 1 ? 'song' : 'songs'}`
    : `Add ${count} ${count === 1 ? 'song' : 'songs'} to playlist`
  return (
    <div className="mt-4">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Songs in input" value={importer.counts.inputCount} />
        <Stat label="Ready to import" value={count} />
        <Stat label="Needs review" value={importer.counts.needsReviewCount} />
        <Stat label="Not found" value={importer.counts.notFoundCount} />
      </dl>
      <div className="mt-4 rounded-2xl border border-line bg-field/50 p-3 text-sm leading-6">
        <p className="font-medium">{destination}</p>
        {importer.destinationKind === 'new' ? (
          <>
            <p className="text-muted">{importer.description.trim() || 'No description'}</p>
            <p className="text-muted">{importer.visibility === 'public' ? 'Public' : 'Private'}</p>
          </>
        ) : (
          <>
            <p className="text-muted">{importer.selected?.ownerName}</p>
            <p className="text-muted">Songs are appended to the end. Existing songs stay in their current order.</p>
          </>
        )}
        {importer.plan.skippedExisting.length > 0 ? <p className="mt-2 text-muted">{importer.plan.skippedExisting.length} already in the playlist and will be skipped.</p> : null}
        {importer.counts.unresolvedCount > 0 ? <p className="text-muted">{importer.counts.unresolvedCount} unresolved {importer.counts.unresolvedCount === 1 ? 'song is' : 'songs are'} left out.</p> : null}
      </div>
      <div className="mt-4 flex justify-end">
        <button type="button" disabled={count === 0 && importer.plan.skippedExisting.length === 0} onClick={() => void importer.confirmImport()} className={primaryButtonClass}>
          {count === 0 ? 'Nothing new to add' : label}
        </button>
      </div>
    </div>
  )
}

function ProgressStep({ operation }: { operation: NonNullable<ReturnType<typeof usePlaylistImport>['operation']> }) {
  const added = addedCount(operation)
  const total = operation.tracks.length
  const percent = total === 0 ? 0 : Math.round((added / total) * 100)
  return (
    <div className="mt-4" aria-busy="true">
      <p className="text-sm text-muted">{operation.phase === 'creating_playlist' ? 'Creating playlist…' : 'Importing songs…'}</p>
      <p className="mt-2 text-sm font-medium tabular-nums">{added} / {total} songs added</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-field" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Import progress">
        <div className="h-full rounded-full bg-accent motion-reduce:transition-none" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-faint">{percent}% completed</p>
    </div>
  )
}

function ResultsStep({ importer, onImportAgain }: { importer: ReturnType<typeof usePlaylistImport>; onImportAgain: () => void }) {
  const operation = importer.operation
  if (!operation) {
    return null
  }
  const added = addedCount(operation)
  const failed = failedCount(operation)
  const uncertain = uncertainCount(operation)
  const heading = resultHeading(operation.phase, operation.destination.kind, added)
  const playlistUrl = operation.playlistUrl?.startsWith('https://open.spotify.com/') ? operation.playlistUrl : null
  return (
    <div className="mt-4">
      <p className="text-lg font-semibold tracking-[-0.03em]">{heading}</p>
      <p className="mt-1 text-sm text-muted">{operation.playlistName}</p>
      {operation.message ? <p role="alert" className="mt-3 text-sm leading-6 text-spot">{operation.message}</p> : null}
      <dl className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Added" value={added} />
        <Stat label="Already in playlist" value={operation.skippedExisting.length} />
        <Stat label="Left out" value={operation.unresolvedCount} />
        <Stat label="Not confirmed" value={failed} />
        {uncertain > 0 ? <Stat label="Needs a check" value={uncertain} /> : null}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {playlistUrl ? <a href={playlistUrl} target="_blank" rel="noreferrer" className={primaryButtonClass}>Open in Spotify</a> : <p className="text-sm text-muted">Spotify did not return a playlist link.</p>}
        {operation.phase === 'failed' || operation.phase === 'partially_completed' ? <button type="button" onClick={() => void importer.retry()} className={secondaryButtonClass}>Retry failed songs</button> : null}
        {operation.phase === 'needs_reconciliation' && operation.playlistId ? <button type="button" onClick={() => void importer.checkPlaylist()} className={secondaryButtonClass}>Check playlist</button> : null}
        {operation.phase === 'needs_reconciliation' && !operation.playlistId ? <button type="button" onClick={importer.allowCreateAgain} className={secondaryButtonClass}>The playlist was not created</button> : null}
        {operation.phase === 'needs_reconciliation' && uncertain > 0 ? <button type="button" onClick={importer.allowBatchAgain} className={secondaryButtonClass}>These songs are missing</button> : null}
        <button type="button" onClick={onImportAgain} className={secondaryButtonClass}>Import again</button>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-field/70 px-3 py-2">
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function playlistMeta(playlist: { ownerName: string; visibility: 'public' | 'private' | null; trackCount: number | null; collaborative: boolean; canModify: boolean }): string {
  const visibility = playlist.visibility === 'public' ? 'Public' : playlist.visibility === 'private' ? 'Private' : 'Visibility unavailable'
  const count = playlist.trackCount === null ? null : `${playlist.trackCount} ${playlist.trackCount === 1 ? 'song' : 'songs'}`
  const access = playlist.canModify ? null : 'Edit access is not guaranteed'
  return [playlist.ownerName, playlist.collaborative ? 'Collaborative' : null, visibility, count, access].filter(Boolean).join(' · ')
}

function validatePreviewName(name: string): string {
  const trimmed = name.trim()
  return trimmed || 'New playlist'
}

function resultHeading(phase: string, kind: 'existing' | 'new', added: number): string {
  if (phase === 'needs_reconciliation') {
    return 'Some songs may have been added.'
  }
  if (phase === 'partially_completed') {
    return 'Some songs were imported.'
  }
  if (phase === 'failed') {
    return 'The import did not finish.'
  }
  if (added === 0) {
    return 'Nothing new was added.'
  }
  return kind === 'new' ? 'Your playlist is ready!' : 'Playlist updated successfully!'
}

const fieldClass = 'mt-1 h-10 w-full rounded-xl border border-line bg-field px-3 text-sm text-text outline-none focus-visible:border-accent'
const primaryButtonClass = 'inline-flex h-11 items-center justify-center rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-[#34c978] disabled:cursor-not-allowed disabled:bg-[#143024] disabled:text-accent'
const secondaryButtonClass = 'inline-flex h-11 items-center justify-center rounded-full border border-line px-4 text-sm text-muted hover:border-line-strong hover:text-text disabled:cursor-not-allowed disabled:text-faint'
