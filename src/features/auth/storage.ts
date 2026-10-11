/**
 * Auth data stays in sessionStorage, not localStorage.
 * A full-page Spotify redirect clears in-memory state, so the tab session has to
 * hold the PKCE transaction and the refresh token until the tab closes.
 * sessionStorage is still readable by any script on this origin. Tokens are never
 * placed in URLs, UI, or logs.
 */
export type KeyValueStorage = {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

export const PKCE_STORAGE_KEY = 'spotify-playlist-importer.pkce'
export const AUTH_SESSION_STORAGE_KEY = 'spotify-playlist-importer.auth-session'
export const SONG_DRAFT_STORAGE_KEY = 'spotify-playlist-importer.song-draft'

export function createMemoryStorage(): KeyValueStorage {
  const values = new Map<string, string>()
  return {
    get(key) {
      return values.get(key) ?? null
    },
    set(key, value) {
      values.set(key, value)
    },
    remove(key) {
      values.delete(key)
    },
  }
}

export function createBrowserStorage(storage: Storage): KeyValueStorage {
  return {
    get(key) {
      return storage.getItem(key)
    },
    set(key, value) {
      storage.setItem(key, value)
    },
    remove(key) {
      storage.removeItem(key)
    },
  }
}

export function browserSessionStorage(): KeyValueStorage {
  return createBrowserStorage(window.sessionStorage)
}
