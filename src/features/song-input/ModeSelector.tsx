import type { KeyboardEvent } from 'react'
import type { InputMode } from '../../shared/types/index.ts'
import { modeContent, modeOrder } from './mode-content.ts'

type ModeSelectorProps = {
  mode: InputMode
  onChange: (mode: InputMode) => void
}

export function ModeSelector({ mode, onChange }: ModeSelectorProps) {
  function selectByKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const lastIndex = modeOrder.length - 1
    let nextIndex: number | null = null

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = index === lastIndex ? 0 : index + 1
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = index === 0 ? lastIndex : index - 1
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = lastIndex
    }

    if (nextIndex === null) {
      return
    }

    event.preventDefault()
    const nextMode = modeOrder[nextIndex]
    if (!nextMode) {
      return
    }

    onChange(nextMode)
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    buttons?.[nextIndex]?.focus()
  }

  return (
    <div role="radiogroup" aria-label="Input mode" className="grid grid-cols-2 rounded-full bg-field p-1 ring-1 ring-line ring-inset">
      {modeOrder.map((option, index) => {
        const selected = mode === option

        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option)}
            onKeyDown={(event) => selectByKey(event, index)}
            className={`h-11 rounded-full px-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              selected ? 'bg-accent text-accent-ink' : 'text-muted hover:text-text'
            }`}
          >
            {modeContent[option].label}
          </button>
        )
      })}
    </div>
  )
}
