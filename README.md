# Playlist Importer

Turn a list of songs into a Spotify playlist with as little effort as possible.

This repository is a single-page playlist importer. Spotify sign-in uses the Authorization Code flow with PKCE in the browser. Song parsing, track matching, playlist changes, and AI are not implemented yet.

## Stack

- React 19, TypeScript, Vite
- Tailwind CSS
- Vitest and React Testing Library
- ESLint

The interface still loads without Spotify credentials. Connecting an account requires the configuration below.

## Setup

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Spotify does not accept `localhost` as a redirect URI, and the development server is bound to the loopback address so the redirect matches exactly.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Typecheck and create a production build |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Run the TypeScript project build |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit and component tests |

## Environment

Copy `.env.example` to `.env.local`:

```bash
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id
VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/callback
VITE_API_BASE_URL=
```

- `VITE_SPOTIFY_CLIENT_ID` — public Spotify client ID. This is not a secret.
- `VITE_SPOTIFY_REDIRECT_URI` — must exactly match a redirect URI registered in the Spotify Dashboard. Do not substitute `localhost`.
- `VITE_API_BASE_URL` — future backend that will host AI parsing. Unused today.

The app stays usable when these values are missing. Connect Spotify stays disabled and names the missing variables. Do not put a Spotify client secret or an AI API key in frontend environment files. `.env` files are gitignored. `.env.example` is the committed template.

## Spotify Developer Setup

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and sign in.
2. Create an app. The app starts in Development Mode.
3. Copy the Client ID into `VITE_SPOTIFY_CLIENT_ID`. Leave the client secret out of this project.
4. In the app settings, add this redirect URI exactly:

   `http://127.0.0.1:5173/callback`

   A production deployment needs its own HTTPS redirect URI. It will not match the local value.
5. Save the settings, then create `.env.local` from the example above.
6. Restart `npm run dev` and open `http://127.0.0.1:5173`.
7. Choose Connect Spotify, approve the requested permissions on Spotify's page, and return to the importer. The header shows the account name.
8. Open the account menu and choose Disconnect to remove the local session. This does not revoke Spotify's authorization grant. Connect Spotify starts a new sign-in.

Development Mode limits, from Spotify's current quota-mode documentation:

- The app owner needs Spotify Premium.
- At most five users can be allowlisted. Add them in the Dashboard under Settings, then Users Management.
- A user who is not allowlisted can still complete the Spotify login, but Web API requests return 403.
- Development Mode has a request quota. A 429 response is a quota or rate limit, not a failed password.
- Extended quota mode is for organizations and is not part of this app.

Requested scopes are `user-read-private`, `playlist-read-private`, `playlist-read-collaborative`, `playlist-modify-private`, and `playlist-modify-public`. `playlist-read-collaborative` is included so a later phase can list collaborative playlists the user may edit. Re-consent would be required if it were added later. Email, playback, listening history, library changes, and streaming are not requested.

The browser keeps the PKCE transaction and the signed-in session in `sessionStorage` for the current tab. That survives the Spotify redirect and a reload, and it is cleared when the tab closes. It is not `localStorage`. Any script running on this origin can read it, so the app never writes tokens into the URL, the interface, or logs.

## Current status

Implemented:

- Dark single-page layout
- AI Mode / Manual Mode toggle, defaulting to Manual Mode
- Song list field that keeps its text when the mode changes, including across the Spotify redirect
- Mode-specific guidance and placeholders
- Prepared file-import and “Find My Songs” controls, both unavailable
- Workflow indicator, with “Add Songs” as the current step
- Spotify Authorization Code flow with PKCE, token refresh, profile display, and local disconnect
- Shared TypeScript types for songs, matches, playlists, import results, and the connected account

Not implemented:

- Manual or AI parsing
- File parsing
- Track search and matching
- Playlist creation or import

## Layout

```text
src/
  app/                  page composition and layout width
  components/layout/    header, hero, footer
  components/workflow/  import steps
  components/ui/        shared controls
  features/auth/        PKCE, token session, account controls
  features/song-input/  mode, text input, file control, draft
  services/spotify/     authenticated request helper and profile
  shared/types/         application data model
  config/               public environment values and Spotify endpoints
```

Later phases can add `src/features/matching`, `src/features/playlists`, and `src/services/ai` without folding that work into the page component.

## Next phase

Phase 3 is manual song-list parsing: turn the text field into structured song lines without calling Spotify or AI.
