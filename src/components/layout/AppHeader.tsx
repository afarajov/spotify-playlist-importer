import { pageColumnClass } from '../../app/layout.ts'
import { SpotifyAccountControl } from '../../features/auth/SpotifyAccountControl.tsx'

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line/90 bg-ink/80 backdrop-blur-md">
      <a
        href="#song-list"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-30 focus:rounded-full focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-accent-ink focus:outline-none"
      >
        Skip to song list
      </a>
      <div className={`${pageColumnClass} flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3`}>
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark />
          <p className="truncate text-[15px] font-semibold tracking-[-0.02em]">Playlist Importer</p>
        </div>
        <SpotifyAccountControl />
      </div>
    </header>
  )
}

function BrandMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="9" fill="#163226" />
      <rect x="8" y="9" width="10" height="2.4" rx="1.2" fill="#3ddc84" />
      <rect x="8" y="14.8" width="16" height="2.4" rx="1.2" fill="#f3f5f2" />
      <rect x="8" y="20.6" width="13" height="2.4" rx="1.2" fill="#3ddc84" opacity="0.75" />
    </svg>
  )
}
