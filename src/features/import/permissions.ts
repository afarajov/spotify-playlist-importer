import { PLAYLIST_MODIFY_SCOPES } from './limits.ts'

export type PlaylistPermissions = {
  known: boolean
  canCreatePrivate: boolean
  canCreatePublic: boolean
  canModify: boolean
  missing: string[]
}

export function playlistPermissions(grantedScopes: readonly string[]): PlaylistPermissions {
  const known = grantedScopes.length > 0
  const missing = known ? PLAYLIST_MODIFY_SCOPES.filter((scope) => !grantedScopes.includes(scope)) : []
  return {
    known,
    canCreatePrivate: !known || grantedScopes.includes('playlist-modify-private'),
    canCreatePublic: !known || grantedScopes.includes('playlist-modify-public'),
    canModify: !known || missing.length < PLAYLIST_MODIFY_SCOPES.length,
    missing: [...missing],
  }
}
