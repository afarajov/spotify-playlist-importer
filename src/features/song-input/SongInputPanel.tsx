import { useCallback, useEffect, useRef, useState } from 'react'
import { PrimaryButton } from '../../components/ui/PrimaryButton.tsx'
import { useSpotifyMatching } from '../matching/useSpotifyMatching.ts'
import type { InputMode, SongEntry, WorkflowStage } from '../../shared/types/index.ts'
import { ImportPanel } from '../import/ImportPanel.tsx'
import { readImportJournal, writeImportJournal } from '../import/journal.ts'
import { duplicateEntryIds, withoutProblemEntries } from './duplicates.ts'
import { readSongDraft, writeSongDraft } from './draft.ts'
import { FileUpload } from './FileUpload.tsx'
import { describeInputStats } from './input-stats.ts'
import { modeContent } from './mode-content.ts'
import { ModeSelector } from './ModeSelector.tsx'
import { parseAiText } from './parse-ai.ts'
import { parseCsvText } from './parse-csv.ts'
import { parseManualText } from './parse-manual.ts'
import { readSongFile } from './read-song-file.ts'
import { removeSongEntry, updateSongEntry } from './review.ts'
import { SongInput } from './SongInput.tsx'
import { SongReview } from './SongReview.tsx'

type PendingImport = {
  fileName: string
  kind: 'txt' | 'csv' | 'docx'
  text: string
  entries: SongEntry[] | null
}

type SongInputPanelProps = {
  onWorkflowStage?: (stage: WorkflowStage) => void
}

export function SongInputPanel({ onWorkflowStage }: SongInputPanelProps) {
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
  const [cleanupNote, setCleanupNote] = useState<string | null>(null)
  const [readingFile, setReadingFile] = useState(false)
  const [organizing, setOrganizing] = useState(false)
  const [showImport, setShowImport] = useState(openImportScreenOnLoad)
  const [importSession, setImportSession] = useState(0)
  const fileRequest = useRef(0)
  const organizeRequest = useRef<AbortController | null>(null)
  const closeReview = useCallback(() => setReviewOpen(false), [])
  const matching = useSpotifyMatching(review)

  useEffect(() => {
    writeSongDraft({ mode, text: songText, review, reviewedText, prepared, fileName })
  }, [mode, songText, review, reviewedText, prepared, fileName])

  useEffect(() => {
    if (showImport) {
      return
    }
    const searching = matching.progress?.active === true
    const hasMatches = Object.values(matching.matches).some((match) => match.status !== 'idle')
    onWorkflowStage?.(searching || hasMatches ? 'review_matches' : 'add_songs')
  }, [matching.matches, matching.progress, onWorkflowStage, showImport])

  const content = modeContent[mode]
  const stats = describeInputStats(songText)
  const textChanged = review !== null && songText !== reviewedText
  const canReview = !organizing && (songText.trim().length > 0 || (review !== null && !textChanged))
  const duplicateIds = duplicateEntryIds(review ?? [])
  const reviewNote = organizing
    ? 'Organizing the list. Spotify is not searched yet.'
    : mode === 'ai'
      ? textChanged
        ? 'The text has changed. Review will organize it again.'
        : 'Review sends this text to the organizer. Spotify is not searched yet.'
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
    setCleanupNote(null)
    matching.reset()
  }

  function requestReview() {
    if (!canReview) {
      return
    }
    if (review !== null && songText === reviewedText) {
      setReviewOpen(true)
      return
    }
    if (mode === 'ai') {
      void organizeWithAi()
      return
    }
    applyTextReview()
  }

  async function organizeWithAi(text = songText, nextFileName: string | null = null) {
    organizeRequest.current?.abort()
    const controller = new AbortController()
    organizeRequest.current = controller
    setOrganizing(true)
    setReviewError(null)
    setSongText(text)
    setFileName(nextFileName)
    const result = await parseAiText(text, controller.signal)
    if (organizeRequest.current !== controller) {
      return
    }
    setOrganizing(false)
    if (!result.ok) {
      if (result.message) {
        setReviewError(result.message)
      }
      return
    }
    setReview(result.entries)
    setReviewedText(text)
    setPrepared(false)
    setPendingImport(null)
    setReviewOpen(true)
    setCleanupNote(null)
    matching.reset()
  }

  function applyImport(imported: PendingImport) {
    if (imported.entries === null) {
      setPendingImport(null)
      setFileError(null)
      void organizeWithAi(imported.text, imported.fileName)
      return
    }
    if (imported.kind === 'csv') {
      setReviewedText(songText)
    } else {
      setSongText(imported.text)
      setReviewedText(imported.text)
    }
    setReview(imported.entries)
    setFileName(imported.fileName)
    setPrepared(false)
    setReviewError(null)
    setFileError(null)
    setPendingImport(null)
    setReviewOpen(true)
    setCleanupNote(null)
    matching.reset()
  }

  function findOnSpotify() {
    if (!review) {
      return
    }
    const kept = withoutProblemEntries(review)
    const removed = review.length - kept.length
    if (removed > 0) {
      setReview(kept)
      for (const entry of review) {
        if (!kept.some((item) => item.id === entry.id)) {
          matching.invalidate(entry.id)
        }
      }
      if (review.every((entry) => entry.source !== 'csv')) {
        const text = kept.map((entry) => `${entry.artist} - ${entry.title}`).join('\n')
        setSongText(text)
        setReviewedText(text)
      }
      setCleanupNote(removedLinesMessage(removed))
    }
    if (kept.length > 0) {
      matching.find(kept)
    }
  }

  function openImport() {
    const saved = readImportJournal()
    if (!saved || saved.phase === 'completed' || saved.phase === 'partially_completed' || saved.phase === 'failed') {
      writeImportJournal(null)
      setImportSession((value) => value + 1)
    }
    setReviewOpen(false)
    setShowImport(true)
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
    if (mode === 'ai') {
      const imported = { fileName: read.fileName, kind: read.kind, text: read.text, entries: null }
      if (review !== null || songText.trim().length > 0) {
        setPendingImport(imported)
        return
      }
      applyImport(imported)
      return
    }
    const parsed = read.kind === 'csv'
      ? parseCsvText(read.text)
      : parseManualText(read.text, { source: 'txt' })
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

  if (showImport) {
    return (
      <ImportPanel
        key={importSession}
        entries={review ?? []}
        matches={matching.matches}
        onBack={() => setShowImport(false)}
        onWorkflowStage={onWorkflowStage}
      />
    )
  }

  return (
    <section
      aria-label="Song input"
      className="mt-5 rounded-[28px] border border-line bg-panel p-4 shadow-[0_30px_80px_-48px_rgb(0_0_0/0.9)] sm:p-5"
    >
      <ModeSelector
        mode={mode}
        onChange={(next) => {
          organizeRequest.current?.abort()
          organizeRequest.current = null
          setOrganizing(false)
          setMode(next)
        }}
      />
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
        disabled={readingFile || organizing}
        fileName={fileName}
        error={fileError}
        note={mode === 'ai'
          ? '.txt, .csv, or .docx, up to 1 MB. The file text is organized before Spotify search.'
          : '.txt, .csv, or .docx, up to 1 MB and 1,000 songs. Files stay on this device.'}
        pending={pendingImport}
        replacesTypedText={mode === 'ai' || pendingImport?.kind !== 'csv'}
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
          {organizing ? 'Organizing…' : 'Review Songs'}
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
          matches={matching.matches}
          progress={matching.progress}
          notice={matching.notice}
          cleanupNote={cleanupNote}
          readyCount={matching.readyCount}
          isAuthenticated={matching.isAuthenticated}
          onClose={closeReview}
          onEdit={(id, artist, title) => {
            const previous = review.find((entry) => entry.id === id)
            const next = updateSongEntry(review, id, artist, title)
            const updated = next.find((entry) => entry.id === id)
            setReview(next)
            if (previous && updated && (previous.artist !== updated.artist || previous.title !== updated.title)) {
              matching.invalidate(id)
            }
            if (JSON.stringify(next) !== JSON.stringify(review)) {
              setPrepared(false)
            }
          }}
          onRemove={(id) => {
            setReview(removeSongEntry(review, id))
            matching.invalidate(id)
            setPrepared(false)
          }}
          onFind={findOnSpotify}
          onChoosePlaylist={openImport}
          onCancelSearch={matching.cancel}
          onSelectMatch={matching.select}
          onConfirmMatch={matching.confirm}
          onRetryMatch={matching.retry}
          onManualSearch={(songId, query) => {
            void matching.searchManually(songId, query)
          }}
        />
      ) : null}
    </section>
  )
}

function openImportScreenOnLoad(): boolean {
  const saved = readImportJournal()
  if (!saved || saved.phase === 'completed') {
    if (saved) {
      writeImportJournal(null)
    }
    return false
  }
  return true
}

function removedLinesMessage(count: number): string {
  if (count === 1) {
    return 'Removed 1 line that was a duplicate or not written as Artist - Song Title.'
  }
  return `Removed ${count} lines that were duplicates or not written as Artist - Song Title.`
}
