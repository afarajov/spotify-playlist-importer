import type { InputMode } from '../../shared/types/index.ts'

export const modeContent: Record<
  InputMode,
  {
    label: string
    description: string
    supportingText: string
    placeholder: string
  }
> = {
  ai: {
    label: 'AI Mode',
    description: 'Paste any song list. AI will organize it for you.',
    supportingText: 'Messy lists, numbering, and grouped artists are welcome.',
    placeholder: `My favorite songs:
blinding lights by weekend
505 arctic monkeys
creep from radiohead
also add yellow by coldplay`,
  },
  manual: {
    label: 'Manual Mode',
    description: 'Enter your songs using the required format.',
    supportingText: 'Artist - Song Title',
    placeholder: `The Weeknd - Blinding Lights
Arctic Monkeys - 505
Radiohead - Creep
Coldplay - Yellow`,
  },
}

export const modeOrder: InputMode[] = ['ai', 'manual']
