# CareOS

## Local demo

1. Install dependencies with `npm install`.
2. Create `.env.local` with `OPENAI_API_KEY=...`.
3. Start the app with `npm run dev`.
4. Enter a typed note in the main screen and send it to compile.
5. If transcription is unavailable, keep using the typed-note path.
6. Press `F` to swap the active pane to the cached fallback without changing modes.
7. If live compile is unavailable, the UI falls back to cached fixture data.

## API routes

- `POST /api/compile` with `{ "note": string, "mode": "off" | "on" }`
- `GET /api/resident`
- `POST /api/transcribe` for optional mic transcription
