import { pageColumnClass } from '../../app/layout.ts'

export function AppFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className={`${pageColumnClass} flex flex-col gap-1 py-6 text-xs leading-5 text-faint`}>
        <p className="font-medium text-muted">Playlist Importer</p>
        <p>Turn any song list into a Spotify playlist.</p>
        <p>Spotify is a trademark of Spotify AB. This independent app is not affiliated with Spotify.</p>
      </div>
    </footer>
  )
}
