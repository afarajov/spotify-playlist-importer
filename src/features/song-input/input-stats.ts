export function describeInputStats(text: string): { lineLabel: string; characterLabel: string } {
  const characters = text.length
  const lines = text.length === 0 ? 0 : text.split(/\r?\n/).length

  return {
    lineLabel: `${lines} ${lines === 1 ? 'line' : 'lines'}`,
    characterLabel: `${characters} ${characters === 1 ? 'character' : 'characters'}`,
  }
}
