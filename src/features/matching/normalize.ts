const APOSTROPHES = /[\u2018\u2019\u201B\u2032]/g
const QUOTES = /[\u201C\u201D]/g
const DASHES = /[\u2010-\u2015\u2212]/g

export function normalizeForCompare(value: string): string {
  return value
    .normalize('NFKC')
    .replace(APOSTROPHES, "'")
    .replace(QUOTES, '"')
    .replace(DASHES, '-')
    .toLowerCase()
    .replace(/\u0131/g, 'i')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/&/g, ' and ')
    .replace(/[/\\|]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function comparisonKey(artist: string, title: string): string {
  return `${normalizeForCompare(artist)}\u0000${normalizeForCompare(title)}`
}

export function splitArtists(value: string): string[] {
  const prepared = value.normalize('NFKC').replace(APOSTROPHES, "'").replace(DASHES, '-').toLowerCase()
  return prepared
    .split(/\s+(?:feat\.?|ft\.?|featuring)\s+|\s+x\s+|\s*[,&]\s*/)
    .flatMap(splitCollaborationAnd)
    .map((part) => normalizeForCompare(part))
    .filter((part) => part.length > 0)
}

function splitCollaborationAnd(value: string): string[] {
  const bits = value.split(/\s+and\s+/)
  if (bits.length < 2) {
    return [value]
  }
  if (bits.some((bit) => bit === 'the' || bit.startsWith('the '))) {
    return [value]
  }
  return bits
}

export function isShortTitle(value: string): boolean {
  const normalized = normalizeForCompare(value)
  return normalized.length > 0 && (normalized.length <= 3 || /^\d+$/.test(normalized))
}
