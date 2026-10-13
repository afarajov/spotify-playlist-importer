export const MAX_SONG_TEXT_CHARS = 100_000
export const MAX_EXTRACTED_SONGS = 1_000

export const songListSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['songs'],
  properties: {
    songs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['artist', 'title', 'uncertain', 'note'],
        properties: {
          artist: { type: 'string' },
          title: { type: 'string' },
          uncertain: { type: 'boolean' },
          note: { type: 'string' },
        },
      },
    },
  },
}

export const extractionInstructions = [
  'Extract songs from messy user text.',
  'Correct obvious spelling of a well-known artist or title.',
  'Keep the user order.',
  'If a line does not clearly contain both an artist and a title, set uncertain to true, leave the unknown field as an empty string, and explain why in note.',
  'Do not invent a song the user did not mention.',
  'When a song is clear, set uncertain to false and note to an empty string.',
].join('\n')

export function normalizeSongText(value) {
  if (typeof value !== 'string') {
    throw coded('invalid_json', 400)
  }
  const text = value.trim()
  if (!text) {
    throw coded('empty_text', 400)
  }
  if (text.length > MAX_SONG_TEXT_CHARS) {
    throw coded('text_too_long', 413)
  }
  return text
}

export function extractionRequest(text) {
  return {
    model: 'gpt-6-luna',
    reasoning: { effort: 'none' },
    input: [
      { role: 'system', content: extractionInstructions },
      { role: 'user', content: text },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'song_list',
        strict: true,
        schema: songListSchema,
      },
    },
  }
}

export function readSongList(value) {
  if (typeof value !== 'object' || value === null || !Array.isArray(value.songs) || value.songs.length > MAX_EXTRACTED_SONGS) {
    throw coded('invalid_model_response', 502)
  }

  return value.songs.map((item) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof item.artist !== 'string' ||
      typeof item.title !== 'string' ||
      typeof item.note !== 'string' ||
      typeof item.uncertain !== 'boolean'
    ) {
      throw coded('invalid_model_response', 502)
    }

    const artist = item.artist.trim()
    const title = item.title.trim()
    const note = item.note.trim()
    const uncertain = item.uncertain || artist.length === 0 || title.length === 0
    return {
      artist,
      title,
      uncertain,
      note: uncertain && note.length === 0 ? 'Artist or title is missing.' : note,
    }
  })
}

function coded(code, statusCode) {
  return Object.assign(new Error(code), { code, statusCode })
}
