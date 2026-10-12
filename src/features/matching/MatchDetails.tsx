import { useState } from 'react'
import type { TrackCandidate, TrackMatch } from '../../shared/types/index.ts'

type MatchDetailsProps = {
  songLabel: string
  match: TrackMatch
  busy: boolean
  onSelect: (trackId: string) => void
  onConfirm: () => void
  onRetry: () => void
  onManualSearch: (query: string) => void
}

const CONFIDENCE_LABEL = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
} as const

export function MatchDetails({ songLabel, match, busy, onSelect, onConfirm, onRetry, onManualSearch }: MatchDetailsProps) {
  const [alternativesOpen, setAlternativesOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualQuery, setManualQuery] = useState('')
  const selected = match.candidates.find((candidate) => candidate.trackId === match.selectedTrackId) ?? null
  const confirmed = match.confirmation === 'confirmed' || match.manuallySelected

  function toggleAlternatives() {
    if (!alternativesOpen) {
      setAlternativesOpen(true)
      return
    }
    if (match.selectedTrackId) {
      onConfirm()
    }
    setAlternativesOpen(false)
  }

  if (match.status === 'searching') {
    return <p className="mt-2 text-sm text-muted">Searching Spotify…</p>
  }

  return (
    <div className="mt-3 rounded-2xl border border-line bg-field/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-72">
          {match.status === 'error' ? <p className="text-sm leading-5 text-spot">{match.errorMessage}</p> : null}
          {match.status === 'not_found' ? <p className="text-sm leading-5 text-muted">No close Spotify track was found.</p> : null}
          {selected ? (
            <TrackCard
              candidate={selected}
              confidence={match.confidence}
              confirmed={confirmed}
              unavailable={!selected.available}
            />
          ) : null}
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          {match.candidates.length > 0 ? (
            <button
              type="button"
              aria-expanded={alternativesOpen}
              onClick={toggleAlternatives}
              className={alternativesOpen ? primaryButtonClass : secondaryButtonClass}
            >
              {alternativesOpen ? 'Confirm' : 'Change match'}
            </button>
          ) : null}
          {match.status === 'error' ? (
            <button type="button" disabled={busy} onClick={onRetry} className={secondaryButtonClass}>
              Retry
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={onRetry} className={secondaryButtonClass}>
              Search again
            </button>
          )}
          <button type="button" aria-expanded={manualOpen} onClick={() => setManualOpen((open) => !open)} className={secondaryButtonClass}>
            Search manually
          </button>
        </div>
      </div>
      {alternativesOpen ? (
        <ul className="mt-3 space-y-2" aria-label={`Other matches for ${songLabel}`}>
          {match.candidates.map((candidate) => (
            <li key={candidate.trackId}>
              <TrackChoice candidate={candidate} selected={candidate.trackId === match.selectedTrackId} onSelect={() => onSelect(candidate.trackId)} />
            </li>
          ))}
        </ul>
      ) : null}
      {manualOpen ? (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault()
            onManualSearch(manualQuery)
          }}
        >
          <label className="min-w-0 flex-1 text-xs text-muted">
            Spotify search
            <input
              value={manualQuery}
              onChange={(event) => setManualQuery(event.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-line bg-field px-3 text-sm text-text outline-none focus-visible:border-accent"
            />
          </label>
          <button type="submit" disabled={busy || manualQuery.trim().length === 0} className={`${primaryButtonClass} sm:mt-5`}>
            Search
          </button>
        </form>
      ) : null}
    </div>
  )
}

function TrackCard({
  candidate,
  confidence,
  confirmed,
  unavailable,
}: {
  candidate: TrackCandidate
  confidence: TrackMatch['confidence']
  confirmed: boolean
  unavailable: boolean
}) {
  const confidenceLabel = `${confirmed ? 'Confirmed' : confidence ? CONFIDENCE_LABEL[confidence] : 'Needs review'}${candidate.versionLabels.length > 0 ? ` · ${candidate.versionLabels.join(', ')}` : ''}`

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Artwork candidate={candidate} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{candidate.title}</p>
        <p className="truncate text-sm text-muted">
          {candidate.artists.join(', ') || 'Unknown artist'}
          {candidate.albumName ? <span className="text-faint"> · {candidate.albumName}</span> : null}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs text-accent">{confidenceLabel}</p>
        {unavailable ? <p className="mt-1 text-xs text-spot">May be unavailable in your market.</p> : null}
        {candidate.externalUrl ? (
          <a href={candidate.externalUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-muted underline-offset-2 hover:text-text hover:underline">
            Open in Spotify
          </a>
        ) : null}
      </div>
    </div>
  )
}

function TrackChoice({ candidate, selected, onSelect }: { candidate: TrackCandidate; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-start gap-3 rounded-2xl border px-2 py-2 text-left ${selected ? 'border-accent/70 bg-accent/10' : 'border-line hover:border-line-strong'}`}
    >
      <Artwork candidate={candidate} />
      <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{candidate.title}</span>
          <span className="block truncate text-sm text-muted">
            {candidate.artists.join(', ')}
            {candidate.albumName ? <span className="text-faint"> · {candidate.albumName}</span> : null}
          </span>
        </span>
        <span className="shrink-0 text-xs text-faint">
          {candidate.versionLabels.length > 0 ? `${candidate.versionLabels.join(', ')} · ` : ''}
          {CONFIDENCE_LABEL[candidate.confidence]}
        </span>
      </span>
    </button>
  )
}

function Artwork({ candidate }: { candidate: TrackCandidate }) {
  if (!candidate.imageUrl) {
    return <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-ink text-xs text-faint">No art</span>
  }
  return (
    <img
      src={candidate.imageUrl}
      alt=""
      width={48}
      height={48}
      className="size-12 shrink-0 rounded-lg bg-ink object-contain"
    />
  )
}

const primaryButtonClass = 'inline-flex h-9 items-center justify-center rounded-full bg-accent px-3 text-sm font-semibold text-accent-ink disabled:cursor-not-allowed disabled:bg-[#143024] disabled:text-accent'
const secondaryButtonClass = 'inline-flex h-9 items-center justify-center rounded-full border border-line px-3 text-sm text-muted hover:border-line-strong hover:text-text disabled:cursor-not-allowed disabled:text-faint'
