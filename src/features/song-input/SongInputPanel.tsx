import { useEffect, useState } from 'react'
import { PrimaryButton } from '../../components/ui/PrimaryButton.tsx'
import type { InputMode } from '../../shared/types/index.ts'
import { readSongDraft, writeSongDraft } from './draft.ts'
import { FileUpload } from './FileUpload.tsx'
import { describeInputStats } from './input-stats.ts'
import { modeContent } from './mode-content.ts'
import { ModeSelector } from './ModeSelector.tsx'
import { SongInput } from './SongInput.tsx'

export function SongInputPanel() {
  const [storedDraft] = useState(() => readSongDraft())
  const [mode, setMode] = useState<InputMode>(storedDraft?.mode ?? 'manual')
  const [songText, setSongText] = useState(storedDraft?.text ?? '')

  useEffect(() => {
    writeSongDraft({ mode, text: songText })
  }, [mode, songText])
  const content = modeContent[mode]
  const stats = describeInputStats(songText)

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
      <FileUpload />
      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p id="find-songs-note" className="text-sm leading-6 text-muted">
          Song processing will be available in a later phase.
        </p>
        <PrimaryButton disabled describedBy="find-songs-note">
          Find My Songs
        </PrimaryButton>
      </div>
    </section>
  )
}
