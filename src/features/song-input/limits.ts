export const MAX_SONG_FILE_BYTES = 1_048_576
export const MAX_SONG_ENTRIES = 1_000

export const missingSeparatorMessage = 'Missing separator. Use Artist - Song Title.'
export const missingArtistMessage = 'Artist name is required.'
export const missingTitleMessage = 'Song title is required.'

export function tooManySongsMessage(): string {
  return `This list has more than ${MAX_SONG_ENTRIES.toLocaleString('en-US')} songs. Split it into smaller parts.`
}
