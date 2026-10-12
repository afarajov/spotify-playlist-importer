import { normalizeForCompare } from './normalize.ts'

export function stringSimilarity(left: string, right: string): number {
  const a = normalizeForCompare(left)
  const b = normalizeForCompare(right)
  if (!a || !b) {
    return 0
  }
  if (a === b) {
    return 1
  }
  const maxLength = Math.max(a.length, b.length)
  const edit = 1 - levenshtein(a, b) / maxLength
  if (maxLength <= 3 || /^\d+$/.test(a) || /^\d+$/.test(b)) {
    return clamp(edit)
  }
  return clamp(jaroWinkler(a, b) * 0.5 + edit * 0.35 + tokenJaccard(a, b) * 0.15)
}

export function levenshtein(left: string, right: string): number {
  if (left === right) {
    return 0
  }
  if (left.length === 0) {
    return right.length
  }
  if (right.length === 0) {
    return left.length
  }
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 0; i < left.length; i += 1) {
    const current = [i + 1]
    for (let j = 0; j < right.length; j += 1) {
      const cost = left[i] === right[j] ? 0 : 1
      current[j + 1] = Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + cost)
    }
    previous = current
  }
  return previous[right.length]
}

function tokenJaccard(left: string, right: string): number {
  const a = new Set(left.split(' ').filter(Boolean))
  const b = new Set(right.split(' ').filter(Boolean))
  if (a.size === 0 || b.size === 0) {
    return 0
  }
  let shared = 0
  for (const token of a) {
    if (b.has(token)) {
      shared += 1
    }
  }
  return shared / (a.size + b.size - shared)
}

function jaroWinkler(left: string, right: string): number {
  const jaro = jaroSimilarity(left, right)
  let prefix = 0
  const limit = Math.min(4, left.length, right.length)
  while (prefix < limit && left[prefix] === right[prefix]) {
    prefix += 1
  }
  return jaro + prefix * 0.1 * (1 - jaro)
}

function jaroSimilarity(left: string, right: string): number {
  const window = Math.max(0, Math.floor(Math.max(left.length, right.length) / 2) - 1)
  const leftMatches = Array.from({ length: left.length }, () => false)
  const rightMatches = Array.from({ length: right.length }, () => false)
  let matches = 0
  for (let i = 0; i < left.length; i += 1) {
    const start = Math.max(0, i - window)
    const end = Math.min(i + window + 1, right.length)
    for (let j = start; j < end; j += 1) {
      if (rightMatches[j] || left[i] !== right[j]) {
        continue
      }
      leftMatches[i] = true
      rightMatches[j] = true
      matches += 1
      break
    }
  }
  if (matches === 0) {
    return 0
  }
  let transpositions = 0
  let k = 0
  for (let i = 0; i < left.length; i += 1) {
    if (!leftMatches[i]) {
      continue
    }
    while (!rightMatches[k]) {
      k += 1
    }
    if (left[i] !== right[k]) {
      transpositions += 1
    }
    k += 1
  }
  const matched = matches
  return (matched / left.length + matched / right.length + (matched - transpositions / 2) / matched) / 3
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}
