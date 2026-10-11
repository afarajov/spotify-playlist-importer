import { useEffect, useId, useRef, useState } from 'react'
import type { AuthError, AuthStatus, SpotifyAccount } from '../../shared/types/index.ts'
import { useSpotifyAuth } from './useSpotifyAuth.ts'

const connectButtonClass =
  'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-line-strong bg-ink-raised px-3.5 text-sm font-medium text-text transition-colors hover:border-accent/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

type AccountControlProps = {
  status: AuthStatus
  isConfigured: boolean
  account: SpotifyAccount | null
  error: AuthError | null
  configurationMessage: string | null
  onConnect: () => void
  onDisconnect: () => void
}

export function SpotifyAccountControl() {
  const auth = useSpotifyAuth()
  return (
    <SpotifyAccountControlView
      status={auth.status}
      isConfigured={auth.isConfigured}
      account={auth.account}
      error={auth.error}
      configurationMessage={auth.configurationMessage}
      onConnect={() => {
        void auth.connect()
      }}
      onDisconnect={auth.disconnect}
    />
  )
}

export function SpotifyAccountControlView({
  status,
  isConfigured,
  account,
  error,
  configurationMessage,
  onConnect,
  onDisconnect,
}: AccountControlProps) {
  const isLoading = status === 'redirecting' || status === 'exchanging'
  const banner =
    error?.message ?? (status === 'signed_out' && !isConfigured ? configurationMessage : null)

  return (
    <>
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        {status === 'signed_in' ? (
          <AccountMenu account={account} onDisconnect={onDisconnect} />
        ) : (
          <>
            {!isConfigured && !isLoading ? (
              <p className="flex items-center gap-2 text-xs text-muted">
                <span className="size-1.5 shrink-0 rounded-full bg-spot" aria-hidden="true" />
                Not configured
              </p>
            ) : null}
            <button
              type="button"
              className={
                isLoading || !isConfigured
                  ? `${connectButtonClass} cursor-not-allowed text-muted`
                  : connectButtonClass
              }
              disabled={isLoading || !isConfigured}
              aria-busy={isLoading || undefined}
              onClick={onConnect}
            >
              <ConnectIcon />
              {isLoading ? 'Connecting…' : 'Connect Spotify'}
            </button>
          </>
        )}
      </div>
      {banner ? (
        <p className="basis-full text-xs leading-5 text-spot" role={error ? 'alert' : undefined}>
          {banner}
        </p>
      ) : null}
    </>
  )
}

function AccountMenu({
  account,
  onDisconnect,
}: {
  account: SpotifyAccount | null
  onDisconnect: () => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const label = account?.displayName || 'Spotify account'
  const profileUrl = account?.profileUrl?.startsWith('https://') ? account.profileUrl : null

  useEffect(() => {
    if (!open) {
      return
    }
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        className="inline-flex h-10 max-w-[12rem] items-center gap-2 rounded-full border border-line-strong bg-ink-raised py-1 pr-3 pl-1.5 text-sm font-medium text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:max-w-[16rem]"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          setOpen((current) => !current)
        }}
      >
        <Avatar account={account} />
        <span className="truncate">{label}</span>
        <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Spotify account"
          className="absolute right-0 z-30 mt-2 w-56 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-line bg-panel p-1.5 shadow-[0_24px_60px_-36px_rgb(0_0_0/0.9)]"
        >
          <p className="px-2.5 py-2 text-xs leading-5 text-muted">
            Connected as <span className="font-medium text-text">{label}</span>
          </p>
          {profileUrl ? (
            <a
              role="menuitem"
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl px-2.5 py-2 text-sm text-text hover:bg-ink-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              onClick={() => {
                setOpen(false)
              }}
            >
              Open Spotify profile
            </a>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="block w-full rounded-xl px-2.5 py-2 text-left text-sm text-text hover:bg-ink-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={() => {
              setOpen(false)
              onDisconnect()
            }}
          >
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  )
}

function Avatar({ account }: { account: SpotifyAccount | null }) {
  if (account?.imageUrl) {
    return (
      <img
        src={account.imageUrl}
        alt=""
        className="size-7 shrink-0 rounded-full object-cover"
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#163226] text-[10px] font-semibold tracking-wide text-accent"
    >
      {initials(account?.displayName ?? null)}
    </span>
  )
}

function initials(name: string | null): string {
  if (!name) {
    return 'S'
  }
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
  return letters.join('') || 'S'
}

function ConnectIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-accent">
      <path
        d="M6.2 8.4a3.2 3.2 0 0 1 .1-4.5l1.2-1.2a3.2 3.2 0 0 1 4.5 4.5l-.7.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M9.8 7.6a3.2 3.2 0 0 1-.1 4.5l-1.2 1.2a3.2 3.2 0 0 1-4.5-4.5l.7-.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
