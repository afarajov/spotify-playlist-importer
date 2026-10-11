import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { resetSpotifySessionForTests } from '../features/auth/session.ts'

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
  resetSpotifySessionForTests()
  window.history.replaceState(null, '', '/')
})
