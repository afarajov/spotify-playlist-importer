import { unzipSync } from 'fflate'
import { MAX_SONG_FILE_BYTES } from './limits.ts'

export type SongFileKind = 'txt' | 'csv' | 'docx'

export type DecodedSongText = { ok: true; text: string } | { ok: false; message: string }

export type ReadSongFileResult =
  | { ok: true; kind: SongFileKind; fileName: string; text: string }
  | { ok: false; message: string }

export function songFileKind(fileName: string): SongFileKind | null {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.txt')) {
    return 'txt'
  }
  if (lower.endsWith('.csv')) {
    return 'csv'
  }
  if (lower.endsWith('.docx')) {
    return 'docx'
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
    return { ok: false, message: 'Use a .txt, .csv, or .docx file.' }
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

  if (kind === 'docx') {
    return textFromDocx(bytes, file.name)
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

function textFromDocx(bytes: Uint8Array, fileName: string): ReadSongFileResult {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    return { ok: false, message: 'This .docx file could not be read.' }
  }
  const document = files['word/document.xml']
  if (!document) {
    return { ok: false, message: 'This .docx file could not be read.' }
  }
  const xml = new TextDecoder('utf-8').decode(document)
  const text = paragraphsFromWordXml(xml).join('\n')
  if (text.trim() === '') {
    return { ok: false, message: 'This file is empty.' }
  }
  return { ok: true, kind: 'docx', fileName, text }
}

function paragraphsFromWordXml(xml: string): string[] {
  return xml.split(/<w:p(?:\s[^>]*)?>/).slice(1).map((paragraph) => {
    const withBreaks = paragraph.replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n')
    return [...withBreaks.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
      .map((match) => decodeXml(match[1] ?? ''))
      .join('')
  })
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number.parseInt(digits, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}
