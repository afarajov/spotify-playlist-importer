# Playlist Importer

Turn a list of songs into a Spotify playlist with as little effort as possible.

This repository is the Phase 1 foundation: a single-page interface, shared data types, and the project setup. Spotify sign-in, song parsing, track matching, playlist changes, and AI are not implemented yet.

## Stack

- React 19, TypeScript, Vite
- Tailwind CSS
- Vitest and React Testing Library
- ESLint

The app runs locally without Spotify credentials or an AI API key.

## Setup

```bash
npm install
npm run dev
```

Open the URL printed by Vite, usually `http://localhost:5173`.

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

Copy `.env.example` to `.env.local` only when a later phase needs it. Both values are optional today:

- `VITE_SPOTIFY_CLIENT_ID` — public Spotify client ID for a future PKCE login
- `VITE_API_BASE_URL` — future backend that will host AI parsing

Do not put Spotify client secrets or AI API keys in frontend environment files. `.env` files are gitignored. `.env.example` is the committed template.

## Current status

Implemented:

- Dark single-page layout
- AI Mode / Manual Mode toggle, defaulting to Manual Mode
- Song list field that keeps its text when the mode changes
- Mode-specific guidance and placeholders
- Prepared file-import and “Find My Songs” controls, both unavailable
- Workflow indicator, with “Add Songs” as the current step
- Shared TypeScript types for songs, matches, playlists, and import results

Not implemented:

- Spotify OAuth and Web API
- Manual or AI parsing
- File parsing
- Track matching
- Playlist creation or import

## Layout

```text
src/
  app/                  page composition and layout width
  components/layout/    header, hero, footer
  components/workflow/  import steps
  components/ui/        shared controls
  features/song-input/  mode, text input, file control
  shared/types/         application data model
  config/               public environment values
```

Later phases can add `src/features/auth`, `src/features/matching`, `src/features/playlists`, `src/services/spotify`, and `src/services/ai` without folding that work into the page component.

## Next phase

Phase 2 is Spotify authentication with the Authorization Code flow and PKCE: connect, callback, token lifecycle, connection status, and disconnect.
