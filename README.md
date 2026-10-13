# Playlist Importer

Turn a list of songs into a Spotify playlist with as little effort as possible.

This repository is a single-page playlist importer. Spotify sign-in uses the Authorization Code flow with PKCE in the browser. Manual lists, `.txt`, `.csv`, or `.docx` files, and messy text organized by a local AI server can be reviewed, matched to Spotify tracks locally, and appended to a playlist. The AI server sees only the song text.

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
| `npm run server` | Start the local organizer on `127.0.0.1:8787` |
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

Requested scopes are `user-read-private`, `playlist-read-private`, `playlist-read-collaborative`, `playlist-modify-private`, and `playlist-modify-public`. Those playlist scopes cover listing private and collaborative playlists and creating or updating public and private playlists. Email, playback, listening history, library changes, and streaming are not requested. If an older session is missing a playlist scope, the import screen asks you to connect again. The song list in this tab is kept.

The browser keeps the PKCE transaction and the signed-in session in `sessionStorage` for the current tab. That survives the Spotify redirect and a reload, and it is cleared when the tab closes. It is not `localStorage`. Any script running on this origin can read it, so the app never writes tokens into the URL, the interface, or logs.

## Song lists

Manual Mode reads one song per line:

```text
The Weeknd - Blinding Lights
Arctic Monkeys - 505
Radiohead - Creep
```

The separator is ` - `, including the spaces. Only the first separator matters, so `Artist - Song Title - Live Version` keeps `Song Title - Live Version` as the title. Empty lines are skipped. A line without that separator, or with a missing artist or title, stays in the review with an explanation. Spelling is not corrected here.

`.txt` files use the same format. `.docx` files use one paragraph per song in that same format. `.csv` files need `artist` and `title` columns in either order. Extra columns are ignored. Quoted values can contain commas.

```csv
artist,title
The Weeknd,Blinding Lights
Arctic Monkeys,505
```

Files are read in the browser as UTF-8, up to 1 MB and 1,000 songs. Nothing is uploaded. Choosing a file asks before it replaces a list you already typed or reviewed. The same artist and title, ignoring case and extra spaces, is marked as a duplicate. Find on Spotify removes those later copies, along with lines that are not `Artist - Song Title`, and searches what remains. The first copy of a song stays.

AI Mode does not use this separator. **Review Songs** sends the typed text to `POST /api/parse-songs` on the local organizer. The model is `gpt-6-luna` with reasoning turned off. It may correct an obvious artist or title spelling and must mark an unclear line as uncertain instead of inventing a song. The server checks that shape before the page shows it. Unclear lines stay in the review until they have both an artist and a title. Find on Spotify still searches only complete lines. The same duplicate rows are not removed during import. A repeated song in the list stays repeated unless that exact Spotify track is already in the destination playlist and skipping is turned on.

## Spotify search

**Find on Spotify** searches only songs that already have an artist and a title. The search uses `GET /search?type=track&limit=10`. Development Mode does not allow a higher limit. Each song tries a precise `track:` and `artist:` query first, then a broader query, then a title query, and stops early when a match is already strong. At most three searches are used per song. Two songs are searched at a time, with a short pause between requests.

Repeated artist and title pairs share one search result during that run. Cancelling a search keeps matches that already finished. A 429 with `Retry-After` waits once and retries that request. A 429 with `error.reason` of `QUOTA_EXCEEDED` stops the queue instead of retrying. A failed request is shown as an error, not as “not found”.

Matching runs locally. It compares normalized artist and title text, then adjusts the score for live, remix, acoustic, radio-edit, and similar versions. A remaster is only a small penalty. The score is a 0–100 similarity score, not a probability:

- High confidence: the track is selected automatically and can still be changed.
- Medium confidence: the best track is shown and must be confirmed.
- Low confidence or no suitable track: nothing is selected until the user chooses one.

**Change match** lists the returned recordings. **Confirm** accepts the open choice and closes that list. **Search manually** runs one explicit Spotify query for that row. Editing the artist or title clears that row’s match and leaves the other rows alone. Confirmed tracks and high-confidence matches are the songs that can be imported, in the original list order.

Thresholds and request limits live in `src/features/matching/config.ts`.

## Playlist import

**Choose playlist** appears after at least one song is ready. The song list stays on this device while you pick a destination.

**Existing playlist** loads the first page of `GET /me/playlists` (50 at a time). Followed playlists that you do not own and that are not collaborative are hidden. Playlists you own are treated as editable. Ownership matches either the stable `account_id` or the legacy Spotify user `id`, because playlist owners still use the legacy id. Collaborative playlists are shown with a note that Spotify still has to allow the change. **Load more playlists** fetches the next page. The name filter searches only playlists already loaded.

**Skip songs already in playlist** is the default for an existing playlist. The app reads `GET /playlists/{id}/items` and compares Spotify track URIs, not song titles. Tracks already in the playlist are left out and counted separately. Repeated rows in your own list are still added when that track is not already there. **Allow duplicates** appends every ready track, including ones the playlist already has. If Spotify refuses to show the playlist contents, duplicate checking is unavailable and the import does not pretend the playlist is empty. You can choose to import without that check.

**New playlist** asks for a name, an optional description, and public or private visibility. Private is the default. The playlist is not created when you type the name or switch tabs. `POST /me/playlists` runs only after the final confirmation, and only if there are songs to add. `public` is sent explicitly so Spotify’s default of public is not used by accident.

The preview shows the destination, how many songs were entered, how many are ready, how many still need review, and how many were not found. Nothing is sent until you press the import button. The label is **Add N songs to playlist** or **Create playlist and import N songs**.

Tracks are appended in the prepared order with `POST /playlists/{id}/items`, at most 100 URIs per request, one batch at a time. Progress counts songs Spotify has confirmed. A confirmed failure stops later batches so their order is not scrambled. Those later batches can be retried without sending the batches that already succeeded. A lost response, a network drop, or an HTTP 500 is treated as uncertain: that batch is not sent again until you check the playlist or explicitly say the songs are missing. A new playlist that might already have been created is not created a second time automatically. The app does not delete, replace, rename, or reorder an existing playlist.

A normal 429 waits once, up to 20 seconds, and retries that rejected request. `QUOTA_EXCEEDED` stops the import. An expired access token is refreshed with the existing session. If Spotify still rejects the session, reconnect from the header; the song draft remains in this tab. Completed batches are kept. If the page closes during an import, this tab stores an import journal in `sessionStorage` without tokens. Reloading shows the last confirmed state and does not continue the request. The journal cannot prove what an in-flight request did, and it disappears when the tab closes.

## Current status

Implemented:

- Dark single-page layout
- AI Mode / Manual Mode toggle, defaulting to Manual Mode
- Song list field that keeps its text when the mode changes, including across the Spotify redirect
- Manual review of `Artist - Song Title` lines, plus `.txt`, `.csv`, and `.docx` import
- Editing, removal, validation, and exact duplicate marking
- Spotify track search, local match scoring, alternative selection, and manual search
- Mode-specific guidance and placeholders
- AI organizing for messy text, through the local server, with uncertain lines kept visible
- Workflow indicator through review, playlist choice, and import
- Spotify Authorization Code flow with PKCE, token refresh, profile display, and local disconnect
- Playlist selection, private or public playlist creation, ordered batch import, and result reporting

The organizer is a second local process. Run `npm run server` beside `npm run dev`. Its key is `OPENAI_API_KEY` in `server/.env`, which git already ignores. The page does not receive that key.

## Layout

```text
server/               local organizer, song schema, and response checks
src/
  app/                  page composition and layout width
  components/layout/    header, hero, footer
  components/workflow/  import steps
  components/ui/        shared controls
  features/auth/        PKCE, token session, account controls
  features/song-input/  mode, text input, manual, CSV, and AI review
  features/matching/    normalization, scoring, search queue, match review
  features/import/      playlist choice, import plan, batches, and recovery
  services/spotify/     authenticated request helper, profile, search, and playlists
  shared/types/         application data model
  config/               public environment values and Spotify endpoints
```

## Next phase

The organizer runs only on this machine. A later phase can host that same server. It must still keep the model away from Spotify tokens, track IDs, and playlist contents.
