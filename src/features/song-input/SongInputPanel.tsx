import { useCallback, useEffect, useRef, useState } from 'react'
import { PrimaryButton } from '../../components/ui/PrimaryButton.tsx'
import type { InputMode, SongEntry } from '../../shared/types/index.ts'
import { duplicateEntryIds } from './duplicates.ts'
import { readSongDraft, writeSongDraft } from './draft.ts'
import { FileUpload } from './FileUpload.tsx'
import { describeInputStats } from './input-stats.ts'
import { modeContent } from './mode-content.ts'
import { ModeSelector } from './ModeSelector.tsx'
import { parseCsvText } from './parse-csv.ts'
import { parseManualText } from './parse-manual.ts'
import { readSongFile } from './read-song-file.ts'
import { removeSongEntry, updateSongEntry } from './review.ts'
import { SongInput } from './SongInput.tsx'
import { SongReview } from './SongReview.tsx'

type PendingImport = {
  fileName: string
  kind: 'txt' | 'csv'
  text: string
  entries: SongEntry[]
}

export function SongInputPanel() {
  const [storedDraft] = useState(() => readSongDraft())
  const [mode, setMode] = useState<InputMode>(storedDraft?.mode ?? 'manual')
  const [songText, setSongText] = useState(storedDraft?.text ?? '')
  const [review, setReview] = useState<SongEntry[] | null>(storedDraft?.review ?? null)
  const [reviewedText, setReviewedText] = useState(storedDraft?.reviewedText ?? '')
  const [prepared, setPrepared] = useState(storedDraft?.prepared ?? false)
  const [fileName, setFileName] = useState<string | null>(storedDraft?.fileName ?? null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [readingFile, setReadingFile] = useState(false)
  const fileRequest = useRef(0)
  const closeReview = useCallback(() => setReviewOpen(false), [])

  useEffect(() => {
    writeSongDraft({ mode, text: songText, review, reviewedText, prepared, fileName })
  }, [mode, songText, review, reviewedText, prepared, fileName])

  const content = modeContent[mode]
  const stats = describeInputStats(songText)
  const textChanged = review !== null && songText !== reviewedText
  const canReview = mode === 'manual' && (songText.trim().length > 0 || (review !== null && !textChanged))
  const duplicateIds = duplicateEntryIds(review ?? [])
  const reviewNote = mode === 'ai'
    ? 'AI processing is coming later. Manual Mode can review an Artist - Song Title list now.'
    : textChanged
      ? 'The text has changed.'
      : 'Use Artist - Song Title, one song on each line.'

  function applyTextReview() {
    const result = parseManualText(songText, { source: 'manual' })
    if (!result.ok) {
      setReviewError(result.message)
      return
    }
    if (result.entries.length === 0) {
      setReviewError('Enter at least one song using Artist - Song Title.')
      return
    }
    setReview(result.entries)
    setReviewedText(songText)
    setPrepared(false)
    setFileName(null)
    setReviewError(null)
    setPendingImport(null)
    setReviewOpen(true)
  }

  function requestReview() {
    if (!canReview) {
      return
    }
    if (review !== null && songText === reviewedText) {
      setReviewOpen(true)
      return
    }
    applyTextReview()
  }

  function applyImport(imported: PendingImport) {
    if (imported.kind === 'txt') {
      setSongText(imported.text)
      setReviewedText(imported.text)
    } else {
      setReviewedText(songText)
    }
    setReview(imported.entries)
    setFileName(imported.fileName)
    setPrepared(false)
    setReviewError(null)
    setFileError(null)
    setPendingImport(null)
    setReviewOpen(true)
  }

  async function handleFile(file: File) {
    const request = fileRequest.current + 1
    fileRequest.current = request
    setReadingFile(true)
    setFileError(null)
    setPendingImport(null)
    const read = await readSongFile(file)
    if (fileRequest.current !== request) {
      return
    }
    setReadingFile(false)
    if (!read.ok) {
      setFileError(read.message)
      return
    }
    const parsed = read.kind === 'txt'
      ? parseManualText(read.text, { source: 'txt' })
      : parseCsvText(read.text)
    if (!parsed.ok) {
      setFileError(parsed.message)
      return
    }
    if (parsed.entries.length === 0) {
      setFileError('No songs were found in this file.')
      return
    }
    const imported = { fileName: read.fileName, kind: read.kind, text: read.text, entries: parsed.entries }
    if (review !== null || songText.trim().length > 0) {
      setPendingImport(imported)
      return
    }
    applyImport(imported)
  }

  return (
    <section
      aria-label="Song input"
      className="mt-5 rounded-[28px] border border-line bg-panel p-4 shadow-[0_30px_80px_-48px_rgb(0_0_0/0.9)] sm:p-5"
    >
      <ModeSelector mode={mode} onChange={setMode} />
      <div id="mode-guidance" className="mt-3">
        <p className="text-sm leading-6 text-muted">{content.description}</p>
        <p className="mt-1 text-sm leading-6 text-muted">
          {mode === 'manual' ? (
            <>
              Example <span className="font-medium text-text">{content.supportingText}</span>
            </>
          ) : (
            content.supportingText
          )}
        </p>
      </div>
      <SongInput value={songText} placeholder={content.placeholder} onChange={setSongText} />
      <p id="input-stats" className="mt-2 text-right text-xs text-faint tabular-nums">
        {stats.lineLabel} · {stats.characterLabel}
      </p>
      <FileUpload
        disabled={mode !== 'manual' || readingFile}
        fileName={fileName}
        error={fileError}
        pending={pendingImport}
        onFile={(file) => {
          void handleFile(file)
        }}
        onConfirm={() => {
          if (pendingImport) {
            applyImport(pendingImport)
          }
        }}
        onCancel={() => setPendingImport(null)}
      />
      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p id="review-songs-note" className="text-sm leading-6 text-muted">
          {reviewNote}
        </p>
        <PrimaryButton disabled={!canReview} describedBy="review-songs-note" onClick={requestReview}>
          Review Songs
        </PrimaryButton>
      </div>
      {reviewError ? (
        <p role="alert" className="mt-3 text-sm leading-5 text-spot">
          {reviewError}
        </p>
      ) : null}
      {review ? (
        <SongReview
          open={reviewOpen}
          entries={review}
          duplicateIds={duplicateIds}
          prepared={prepared}
          onClose={closeReview}
          onEdit={(id, artist, title) => {
            const next = updateSongEntry(review, id, artist, title)
            setReview(next)
            if (JSON.stringify(next) !== JSON.stringify(review)) {
              setPrepared(false)
            }
          }}
          onRemove={(id) => {
            setReview(removeSongEntry(review, id))
            setPrepared(false)
          }}
          onPrepare={() => setPrepared(true)}
        />
      ) : null}
    </section>
  )
}
