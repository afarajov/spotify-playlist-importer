export type PlaylistVisibility = 'public' | 'private'

export type PlaylistEditability = 'likely' | 'unconfirmed'

export type EditablePlaylist = {
  id: string
  name: string
  description: string
  visibility: PlaylistVisibility | null
  trackCount: number | null
  ownerName: string
  ownerId: string
  canModify: boolean
  editability: PlaylistEditability
  collaborative: boolean
  imageUrl: string | null
  externalUrl: string | null
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
