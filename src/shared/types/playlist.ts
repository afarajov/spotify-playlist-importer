export type PlaylistVisibility = 'public' | 'private'

export type EditablePlaylist = {
  id: string
  name: string
  description: string
  visibility: PlaylistVisibility
  trackCount: number
  ownerName: string
  canModify: boolean
}

export type PlaylistDestination =
  | {
      kind: 'existing'
      playlistId: string
    }
  | {
      kind: 'new'
      name: string
      description: string
      visibility: PlaylistVisibility
    }
