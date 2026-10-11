import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SongEntry } from '../../shared/types/index.ts'
import { formatSongSummary, summarizeSongs } from './review.ts'

type SongReviewProps = {
  open: boolean
  entries: readonly SongEntry[]
  duplicateIds: ReadonlySet<string>
  prepared: boolean
  onClose: () => void
  onEdit: (id: string, artist: string, title: string) => void
  onRemove: (id: string) => void
  onPrepare: () => void
}

export function SongReview({
  open,
  entries,
  duplicateIds,
  prepared,
  onClose,
  onEdit,
  onRemove,
  onPrepare,
}: SongReviewProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus({ preventScroll: true })

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) {
        return
      }
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')]
      if (focusable.length === 0) {
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus({ preventScroll: true })
    }
  }, [open, onClose])

  if (!open) {
    return null
  }

  const summary = summarizeSongs(entries, duplicateIds)
  const counts = [
    ['Total', summary.total],
    ['Ready', summary.valid],
    ['Need attention', summary.attention],
    ['Duplicates', summary.duplicates],
  ] as const

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-3 sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="song-review-title"
        tabIndex={-1}
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl min-h-0 flex-col overflow-hidden rounded-[28px] border border-line bg-panel shadow-[0_30px_80px_-36px_rgb(0_0_0/0.9)] outline-none sm:max-h-[calc(100dvh-3rem)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id="song-review-title" className="text-base font-semibold tracking-[-0.02em]">
              Parsed songs
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">{formatSongSummary(summary)}</p>
          </div>
          <button
            type="button"
            aria-label="Close review"
            onClick={onClose}
            className="inline-flex h-9 shrink-0 items-center rounded-full border border-line px-3 text-sm text-muted hover:border-line-strong hover:text-text"
          >
            Close
          </button>
        </div>
        <dl className="grid shrink-0 grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-4 sm:px-5">
          {counts.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-line bg-field/70 px-3 py-2">
              <dt className="text-xs text-faint">{label}</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <ol className="max-h-[calc(100dvh-16rem)] divide-y divide-line overflow-y-auto overscroll-contain px-4 sm:max-h-[min(28rem,calc(100dvh-16rem))] sm:px-5">
          {entries.length === 0 ? (
            <li className="py-6 text-sm text-muted">No songs left in this list.</li>
          ) : (
            entries.map((entry, index) => (
              <SongRow
                key={entry.id}
                entry={entry}
                position={index + 1}
                duplicate={duplicateIds.has(entry.id)}
                onEdit={onEdit}
                onRemove={onRemove}
              />
            ))
          )}
        </ol>
        <div className="shrink-0 border-t border-line px-4 py-4 sm:px-5">
          {prepared ? (
            <p className="text-sm leading-6 text-muted">
              {summary.valid} {summary.valid === 1 ? 'song is' : 'songs are'} ready for Spotify search. Finding
              tracks comes in the next phase.
            </p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p id="prepare-search-note" className="text-sm leading-6 text-muted">
                {summary.valid === 0
                  ? 'Correct a song above before preparing the list.'
                  : 'This checks your list only. Spotify matches come later.'}
              </p>
              <button
                type="button"
                disabled={summary.valid === 0}
                aria-describedby="prepare-search-note"
                onClick={onPrepare}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink transition-colors hover:bg-[#34c978] disabled:cursor-not-allowed disabled:bg-[#143024] disabled:text-accent sm:w-auto"
              >
                Prepare for search
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function SongRow({
  entry,
  position,
  duplicate,
  onEdit,
  onRemove,
}: {
  entry: SongEntry
  position: number
  duplicate: boolean
  onEdit: (id: string, artist: string, title: string) => void
  onRemove: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [artist, setArtist] = useState(entry.artist)
  const [title, setTitle] = useState(entry.title)
  const positionLabel = String(position).padStart(2, '0')
  const songLabel = entry.artist && entry.title ? `${entry.artist} - ${entry.title}` : `line ${entry.originalLine}`
  const locationLabel = entry.source === 'csv' ? 'Row' : 'Line'

  if (editing) {
    return (
      <li className="py-3">
        <form
          className="grid gap-3 sm:grid-cols-[2.5rem_1fr]"
          onSubmit={(event) => {
            event.preventDefault()
            onEdit(entry.id, artist, title)
            setEditing(false)
          }}
        >
          <span className="pt-2 text-sm text-faint tabular-nums">{positionLabel}</span>
          <div>
            <p className="text-xs leading-5 text-faint">
              {locationLabel} {entry.originalLine}: {entry.originalText}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-muted">
                Artist
                <input
                  value={artist}
                  onChange={(event) => setArtist(event.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-line bg-field px-3 text-sm text-text outline-none focus-visible:border-accent"
                />
              </label>
              <label className="text-xs text-muted">
                Song title
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-line bg-field px-3 text-sm text-text outline-none focus-visible:border-accent"
                />
              </label>
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-full bg-accent px-3 text-sm font-semibold text-accent-ink"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setArtist(entry.artist)
                  setTitle(entry.title)
                  setEditing(false)
                }}
                className="inline-flex h-9 items-center rounded-full border border-line px-3 text-sm text-muted hover:text-text"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <span className="w-8 shrink-0 pt-0.5 text-sm text-faint tabular-nums">{positionLabel}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium break-words">{entry.artist || 'No artist'}</p>
          <p className="text-sm break-words text-muted">{entry.title || 'No title'}</p>
          {entry.issue ? (
            <p className="mt-1 text-sm leading-5 text-spot">
              {entry.issue}{' '}
              <span className="text-faint">
                {locationLabel} {entry.originalLine}: {entry.originalText}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-accent">{duplicate ? 'Duplicate' : 'Ready'}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            aria-label={`Edit ${songLabel}`}
            onClick={() => {
              setArtist(entry.artist)
              setTitle(entry.title)
              setEditing(true)
            }}
            className="inline-flex h-9 items-center rounded-full border border-line px-3 text-sm text-muted hover:border-line-strong hover:text-text"
          >
            Edit
          </button>
          <button
            type="button"
            aria-label={`Remove ${songLabel}`}
            onClick={() => onRemove(entry.id)}
            className="inline-flex h-9 items-center rounded-full border border-line px-3 text-sm text-muted hover:border-line-strong hover:text-text"
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  )
}
