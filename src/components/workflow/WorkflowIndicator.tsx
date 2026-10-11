import type { WorkflowStage } from '../../shared/types/index.ts'

const stages: { id: WorkflowStage; label: string; step: number }[] = [
  { id: 'add_songs', label: 'Add Songs', step: 1 },
  { id: 'review_matches', label: 'Review Matches', step: 2 },
  { id: 'choose_playlist', label: 'Choose Playlist', step: 3 },
  { id: 'import', label: 'Import', step: 4 },
]

type StageState = 'complete' | 'current' | 'upcoming'

type WorkflowIndicatorProps = {
  currentStage: WorkflowStage
}

export function WorkflowIndicator({ currentStage }: WorkflowIndicatorProps) {
  const currentIndex = stages.findIndex((stage) => stage.id === currentStage)

  return (
    <nav aria-label="Import steps" className="mt-6">
      <div className="relative">
        <div
          className="pointer-events-none absolute top-[13px] right-[12%] left-[12%] h-px bg-line"
          aria-hidden="true"
        />
        <ol className="relative grid grid-cols-4 gap-1">
          {stages.map((stage, index) => {
            const state = stageState(index, currentIndex)

            return (
              <li
                key={stage.id}
                className="flex min-w-0 flex-col items-center gap-2 text-center"
                aria-current={state === 'current' ? 'step' : undefined}
              >
                <span
                  className={`relative z-10 flex size-7 items-center justify-center rounded-full text-xs font-semibold ${circleClass(state)}`}
                >
                  {state === 'complete' ? <CheckIcon /> : stage.step}
                </span>
                <span className={`text-[11px] leading-tight sm:text-xs ${labelClass(state)}`}>
                  <span className="sr-only">{stateLabel(state)}: </span>
                  {stage.label}
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    </nav>
  )
}

function stageState(index: number, currentIndex: number): StageState {
  if (index === currentIndex) {
    return 'current'
  }

  if (currentIndex >= 0 && index < currentIndex) {
    return 'complete'
  }

  return 'upcoming'
}

function stateLabel(state: StageState): string {
  if (state === 'current') {
    return 'Current step'
  }

  if (state === 'complete') {
    return 'Completed step'
  }

  return 'Upcoming step'
}

function circleClass(state: StageState): string {
  if (state === 'current') {
    return 'bg-accent text-accent-ink'
  }

  if (state === 'complete') {
    return 'bg-accent/15 text-accent ring-1 ring-accent/40 ring-inset'
  }

  return 'bg-ink text-faint ring-1 ring-line ring-inset'
}

function labelClass(state: StageState): string {
  if (state === 'current') {
    return 'font-medium text-text'
  }

  if (state === 'complete') {
    return 'text-muted'
  }

  return 'text-faint'
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M2.2 6.2 4.7 8.7 9.8 3.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
