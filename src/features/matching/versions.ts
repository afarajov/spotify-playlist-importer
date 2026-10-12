export const VERSION_KEYS = [
  'live',
  'remix',
  'acoustic',
  'instrumental',
  'radio',
  'extended',
  'demo',
  'karaoke',
  'cover',
  'remaster',
] as const

export type VersionKey = (typeof VERSION_KEYS)[number]

const VERSION_PATTERNS: Record<VersionKey, RegExp> = {
  live: /\blive\b/,
  remix: /\bremix\b|\brework\b/,
  acoustic: /\bacoustic\b/,
  instrumental: /\binstrumental\b/,
  radio: /\bradio edit\b|\bradio version\b/,
  extended: /\bextended\b/,
  demo: /\bdemo\b/,
  karaoke: /\bkaraoke\b/,
  cover: /\bcover\b/,
  remaster: /\bremaster(?:ed)?\b/,
}

const HARD_VERSIONS = new Set<VersionKey>([
  'live',
  'remix',
  'acoustic',
  'instrumental',
  'radio',
  'extended',
  'demo',
  'karaoke',
  'cover',
])

export function detectVersions(title: string): Set<VersionKey> {
  const found = new Set<VersionKey>()
  const normalized = title.normalize('NFKC').toLowerCase()
  for (const key of VERSION_KEYS) {
    if (VERSION_PATTERNS[key].test(normalized)) {
      found.add(key)
    }
  }
  return found
}

export function baseTitle(title: string): string {
  return title
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s[-–—]\s+(?:live|remix|acoustic|instrumental|radio edit|extended|demo|karaoke|cover|remaster(?:ed)?)\b.*$/i, ' ')
}

export function versionAdjustment(queryTitle: string, trackTitle: string): { delta: number; conflict: boolean; labels: VersionKey[] } {
  const requested = detectVersions(queryTitle)
  const found = detectVersions(trackTitle)
  let delta = 0
  let conflict = false
  for (const key of HARD_VERSIONS) {
    const asked = requested.has(key)
    const has = found.has(key)
    if (asked && has) {
      delta += 8
    } else if (asked !== has) {
      delta -= key === 'cover' && has ? 24 : 16
      conflict = true
    }
  }
  if (requested.has('remaster') && found.has('remaster')) {
    delta += 4
  } else if (found.has('remaster')) {
    delta -= 4
  }
  return { delta, conflict, labels: [...found] }
}
