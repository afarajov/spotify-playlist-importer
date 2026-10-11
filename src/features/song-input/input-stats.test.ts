import { describe, expect, it } from 'vitest'
import { describeInputStats } from './input-stats.ts'

describe('describeInputStats', () => {
  it('reports an empty song list as zero lines and characters', () => {
    expect(describeInputStats('')).toEqual({
      lineLabel: '0 lines',
      characterLabel: '0 characters',
    })
  })

  it('counts a single line and uses the singular label', () => {
    expect(describeInputStats('Radiohead - Creep')).toEqual({
      lineLabel: '1 line',
      characterLabel: '17 characters',
    })
  })

  it('counts every visual line, including a trailing break', () => {
    expect(describeInputStats('a\nb\n').lineLabel).toBe('3 lines')
  })
})
