import {
  ACCESS_TOKEN_REFRESH_LEAD_MS,
  PKCE_TRANSACTION_MAX_AGE_MS,
  addSixMonths,
  authMessages,
  developmentModeForbiddenMessage,
  isSpotifyConfigured,
  missingSpotifyConfigMessage,
  readSpotifyConfig,
  type SpotifyConfig,
} from '../../config/spotify.ts'
import type { AuthError, AuthStatus, SpotifyAccount } from '../../shared/types/index.ts'
import { SpotifyApiError } from '../../services/spotify/client.ts'
import { fetchCurrentAccount } from '../../services/spotify/profile.ts'
import { authError, describeRateLimit, isSpotifyAuthError, SpotifyAuthError } from './errors.ts'
import { buildAuthorizationUrl, oauthStatesMatch, parseAuthorizationCallback } from './oauth.ts'
import { createCodeChallenge, generateCodeVerifier, generateOauthState } from './pkce.ts'
import {
  AUTH_SESSION_STORAGE_KEY,
  browserSessionStorage,
  PKCE_STORAGE_KEY,
  type KeyValueStorage,
} from './storage.ts'
import { exchangeAuthorizationCode, refreshAccessToken, type TokenSet } from './token-api.ts'

export type AuthSnapshot = {
  status: AuthStatus
  account: SpotifyAccount | null
  error: AuthError | null
  isConfigured: boolean
  configurationMessage: string | null
  grantedScopes: readonly string[]
}

export type BrowserLocation = {
  pathname: string
  search: string
  assign(url: string): void
  replacePath(path: string): void
}

type PersistedAuthSession = {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: number
  refreshTokenExpiresAt: number
  scope: string
  account: SpotifyAccount | null
}

type PkceTransaction = {
  verifier: string
  state: string
  createdAt: number
}

type SessionOptions = {
  config?: SpotifyConfig
  storage?: KeyValueStorage
  fetchImpl?: typeof fetch
  now?: () => number
  location?: BrowserLocation
  randomBytes?: (length: number) => Uint8Array
}

export class SpotifySession {
  private readonly config: SpotifyConfig
  private readonly storage: KeyValueStorage
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  private readonly location: BrowserLocation
  private readonly randomBytes?: (length: number) => Uint8Array
  private snapshot: AuthSnapshot
  private statusOverride: AuthStatus | null = null
  private error: AuthError | null = null
  private refreshInFlight: Promise<string> | null = null
  private callbackInFlight: Promise<void> | null = null
  private readonly listeners = new Set<(snapshot: AuthSnapshot) => void>()

  constructor(options: SessionOptions = {}) {
    this.config = options.config ?? readSpotifyConfig()
    this.storage = options.storage ?? browserSessionStorage()
    this.fetchImpl = options.fetchImpl ?? fetch
    this.now = options.now ?? Date.now
    this.location = options.location ?? createBrowserLocation()
    this.randomBytes = options.randomBytes
    const expired = this.discardExpiredRefresh()
    this.error = expired ? authError('session_expired') : null
    this.snapshot = this.compute()
  }

  getSnapshot(): AuthSnapshot {
    return this.snapshot
  }

  subscribe(listener: (snapshot: AuthSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async connect(): Promise<void> {
    const missing = missingSpotifyConfigMessage(this.config)
    if (missing || !isSpotifyConfigured(this.config)) {
      this.fail('missing_configuration', missing ?? authMessages.missing_configuration)
      return
    }
    const verifier = generateCodeVerifier(this.randomBytes)
    const state = generateOauthState(this.randomBytes)
    const challenge = await createCodeChallenge(verifier)
    const transaction: PkceTransaction = { verifier, state, createdAt: this.now() }
    this.storage.set(PKCE_STORAGE_KEY, JSON.stringify(transaction))
    this.statusOverride = 'redirecting'
    this.error = null
    this.publish()
    this.location.assign(
      buildAuthorizationUrl({
        clientId: this.config.clientId,
        redirectUri: this.config.redirectUri,
        codeChallenge: challenge,
        state,
      }),
    )
  }

  disconnect(): void {
    this.storage.remove(AUTH_SESSION_STORAGE_KEY)
    this.storage.remove(PKCE_STORAGE_KEY)
    this.statusOverride = null
    this.error = null
    this.refreshInFlight = null
    this.publish()
  }

  handleCallbackIfPresent(): Promise<void> {
    if (this.callbackInFlight) {
      return this.callbackInFlight
    }
    const path = this.location.pathname.replace(/\/+$/, '') || '/'
    if (path !== '/callback') {
      return Promise.resolve()
    }
    const search = this.location.search
    this.location.replacePath('/')
    this.callbackInFlight = this.finishCallback(search).finally(() => {
      this.callbackInFlight = null
    })
    return this.callbackInFlight
  }

  async getValidAccessToken(): Promise<string> {
    const session = this.readSession()
    if (!session) {
      throw new SpotifyAuthError('session_expired')
    }
    if (this.now() >= session.refreshTokenExpiresAt) {
      this.clearCredentials('session_expired')
      throw new SpotifyAuthError('session_expired')
    }
    if (this.now() < session.accessTokenExpiresAt - ACCESS_TOKEN_REFRESH_LEAD_MS) {
      return session.accessToken
    }
    return this.forceRefreshAccessToken()
  }

  forceRefreshAccessToken(): Promise<string> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.performRefresh().finally(() => {
        this.refreshInFlight = null
      })
    }
    return this.refreshInFlight
  }

  private async finishCallback(search: string): Promise<void> {
    this.statusOverride = 'exchanging'
    this.error = null
    this.publish()
    const transaction = this.takePkceTransaction()
    const callback = parseAuthorizationCallback(search)

    if (!transaction) {
      this.fail('missing_verifier')
      return
    }
    if (this.now() - transaction.createdAt > PKCE_TRANSACTION_MAX_AGE_MS) {
      this.fail('expired_verifier')
      return
    }
    if (!oauthStatesMatch(transaction.state, callback.state)) {
      this.fail('invalid_state')
      return
    }
    if (callback.kind === 'error') {
      this.fail(callback.error === 'access_denied' ? 'access_denied' : 'token_exchange_failed')
      return
    }
    if (!callback.code) {
      this.fail('missing_code')
      return
    }

    try {
      const tokens = await exchangeAuthorizationCode({
        clientId: this.config.clientId,
        code: callback.code,
        redirectUri: this.config.redirectUri,
        codeVerifier: transaction.verifier,
        fetchImpl: this.fetchImpl,
      })
      const authorizedAt = this.now()
      this.writeSession({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? '',
        accessTokenExpiresAt: authorizedAt + tokens.expiresIn * 1000,
        refreshTokenExpiresAt: addSixMonths(authorizedAt),
        scope: tokens.scope,
        account: null,
      })
      this.statusOverride = null
      this.publish()
      await this.loadAccount()
    } catch (error) {
      this.failFrom(error, 'token_exchange_failed')
    }
  }

  private async loadAccount(): Promise<void> {
    try {
      const account = await fetchCurrentAccount(this, this.fetchImpl)
      const current = this.readSession()
      if (!current) {
        return
      }
      this.writeSession({ ...current, account })
      this.error = null
      this.publish()
    } catch (error) {
      this.error = toProfileError(error)
      this.publish()
    }
  }

  private async performRefresh(): Promise<string> {
    const session = this.readSession()
    if (!session) {
      this.clearCredentials('session_expired')
      throw new SpotifyAuthError('session_expired')
    }
    if (this.now() >= session.refreshTokenExpiresAt) {
      this.clearCredentials('session_expired')
      throw new SpotifyAuthError('session_expired')
    }
    try {
      const tokens = await refreshAccessToken({
        clientId: this.config.clientId,
        refreshToken: session.refreshToken,
        fetchImpl: this.fetchImpl,
      })
      const next = this.mergeRefresh(session, tokens)
      this.writeSession(next)
      this.error = null
      this.publish()
      return next.accessToken
    } catch (error) {
      if (isSpotifyAuthError(error) && error.code === 'invalid_grant') {
        this.clearCredentials('session_expired')
        throw new SpotifyAuthError('session_expired')
      }
      if (isSpotifyAuthError(error) && (error.code === 'network' || error.code === 'rate_limited')) {
        this.error = { code: error.code, message: error.message }
        this.publish()
        throw error
      }
      this.error = authError('refresh_failed')
      this.publish()
      throw new SpotifyAuthError('refresh_failed')
    }
  }

  private mergeRefresh(session: PersistedAuthSession, tokens: TokenSet): PersistedAuthSession {
    return {
      ...session,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? session.refreshToken,
      accessTokenExpiresAt: this.now() + tokens.expiresIn * 1000,
      scope: tokens.scope || session.scope,
    }
  }

  private takePkceTransaction(): PkceTransaction | null {
    const raw = this.storage.get(PKCE_STORAGE_KEY)
    this.storage.remove(PKCE_STORAGE_KEY)
    if (!raw) {
      return null
    }
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!isPkceTransaction(parsed)) {
        return null
      }
      return parsed
    } catch {
      return null
    }
  }

  private readSession(): PersistedAuthSession | null {
    const raw = this.storage.get(AUTH_SESSION_STORAGE_KEY)
    if (!raw) {
      return null
    }
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!isPersistedSession(parsed)) {
        this.storage.remove(AUTH_SESSION_STORAGE_KEY)
        return null
      }
      return parsed
    } catch {
      this.storage.remove(AUTH_SESSION_STORAGE_KEY)
      return null
    }
  }

  private writeSession(session: PersistedAuthSession): void {
    this.storage.set(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))
  }

  private discardExpiredRefresh(): boolean {
    const session = this.readSession()
    if (!session || this.now() < session.refreshTokenExpiresAt) {
      return false
    }
    this.storage.remove(AUTH_SESSION_STORAGE_KEY)
    return true
  }

  private clearCredentials(code: 'session_expired'): void {
    this.storage.remove(AUTH_SESSION_STORAGE_KEY)
    this.statusOverride = null
    this.error = authError(code)
    this.publish()
  }

  private fail(code: AuthError['code'], message = authMessages[code]): void {
    this.statusOverride = null
    this.error = { code, message }
    this.publish()
  }

  private failFrom(error: unknown, fallback: AuthError['code']): void {
    if (isSpotifyAuthError(error) && error.code === 'invalid_grant') {
      this.storage.remove(AUTH_SESSION_STORAGE_KEY)
      this.fail('session_expired')
      return
    }
    if (isSpotifyAuthError(error)) {
      const code = error.code === 'network' || error.code === 'rate_limited' ? error.code : fallback
      this.fail(code, code === error.code ? error.message : authMessages[fallback])
      return
    }
    this.fail(fallback)
  }

  private compute(): AuthSnapshot {
    const session = this.readSession()
    const signedIn = session !== null && this.now() < session.refreshTokenExpiresAt
    return {
      status: this.statusOverride ?? (signedIn ? 'signed_in' : 'signed_out'),
      account: signedIn ? session.account : null,
      error: this.error,
      isConfigured: isSpotifyConfigured(this.config),
      configurationMessage: missingSpotifyConfigMessage(this.config),
      grantedScopes: signedIn ? session.scope.split(' ').filter((scope) => scope.length > 0) : [],
    }
  }

  private publish(): void {
    this.snapshot = this.compute()
    for (const listener of this.listeners) {
      listener(this.snapshot)
    }
  }
}

function toProfileError(error: unknown): AuthError {
  if (error instanceof SpotifyApiError) {
    if (error.kind === 'forbidden' && error.developmentMode) {
      return { code: 'forbidden', message: developmentModeForbiddenMessage }
    }
    if (error.kind === 'rate_limited') {
      return {
        code: 'rate_limited',
        message: describeRateLimit(error.retryAfterSeconds, error.quotaExceeded),
      }
    }
    if (error.kind === 'network') {
      return authError('network')
    }
    if (error.kind === 'forbidden') {
      return authError('forbidden')
    }
    if (error.kind === 'unauthorized') {
      return authError('unauthorized')
    }
  }
  if (isSpotifyAuthError(error)) {
    return authError(error.code)
  }
  return authError('profile_failed')
}

function isPkceTransaction(value: unknown): value is PkceTransaction {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.verifier === 'string' &&
    value.verifier.length > 0 &&
    typeof value.state === 'string' &&
    value.state.length > 0 &&
    typeof value.createdAt === 'number'
  )
}

function isPersistedSession(value: unknown): value is PersistedAuthSession {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.accessToken === 'string' &&
    value.accessToken.length > 0 &&
    typeof value.refreshToken === 'string' &&
    value.refreshToken.length > 0 &&
    typeof value.accessTokenExpiresAt === 'number' &&
    typeof value.refreshTokenExpiresAt === 'number' &&
    typeof value.scope === 'string' &&
    (value.account === null || isAccount(value.account))
  )
}

function isAccount(value: unknown): value is SpotifyAccount {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.accountId === 'string' &&
    (value.displayName === null || typeof value.displayName === 'string') &&
    (value.imageUrl === null || typeof value.imageUrl === 'string') &&
    (value.profileUrl === null || typeof value.profileUrl === 'string')
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function createBrowserLocation(): BrowserLocation {
  return {
    get pathname() {
      return window.location.pathname
    },
    get search() {
      return window.location.search
    },
    assign(url: string) {
      window.location.assign(url)
    },
    replacePath(path: string) {
      window.history.replaceState(null, '', path)
    },
  }
}

let activeSession: SpotifySession | null = null

export function getSpotifySession(): SpotifySession {
  if (!activeSession) {
    activeSession = new SpotifySession()
  }
  return activeSession
}

export function resetSpotifySessionForTests(): void {
  activeSession = null
}

let configurationWarningShown = false

export function warnIfSpotifyIsUnconfigured(): void {
  if (configurationWarningShown || import.meta.env.MODE !== 'development') {
    return
  }
  const message = missingSpotifyConfigMessage(readSpotifyConfig())
  if (!message) {
    return
  }
  configurationWarningShown = true
  console.warn(message)
}
