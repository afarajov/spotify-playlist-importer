import { MAX_SONG_FILE_BYTES } from './limits.ts'

export type DecodedSongText = { ok: true; text: string } | { ok: false; message: string }

export type ReadSongFileResult =
  | { ok: true; kind: 'txt' | 'csv'; fileName: string; text: string }
  | { ok: false; message: string }

export function songFileKind(fileName: string): 'txt' | 'csv' | null {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.txt')) {
    return 'txt'
  }
  if (lower.endsWith('.csv')) {
    return 'csv'
  }
  return null
}

export function decodeUtf8(bytes: Uint8Array): DecodedSongText {
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  } catch {
    return { ok: false, message: 'This file is not valid UTF-8. Save it as UTF-8 and try again.' }
  }
}

export async function readSongFile(file: File): Promise<ReadSongFileResult> {
  const kind = songFileKind(file.name)
  if (!kind) {
    return { ok: false, message: 'Use a .txt or .csv file.' }
  }
  if (file.size > MAX_SONG_FILE_BYTES) {
    return { ok: false, message: 'This file is larger than 1 MB.' }
  }
  if (file.size === 0) {
    return { ok: false, message: 'This file is empty.' }
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    return { ok: false, message: 'This file could not be read.' }
  }

  const decoded = decodeUtf8(bytes)
  if (!decoded.ok) {
    return decoded
  }
  if (decoded.text.trim() === '') {
    return { ok: false, message: 'This file is empty.' }
  }
  return { ok: true, kind, fileName: file.name, text: decoded.text }
}
