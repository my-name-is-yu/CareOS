# CareOS

CareOS Product v1 is a nurse-facing dementia-care workspace for turning shift notes into memory-backed handoff support. The product helps staff compare a current observation against patient memory and history, verify cited evidence, and surface missing nursing checks for human review.

## Setup

1. Install dependencies with `npm install`.
2. Create `.env.local` with `OPENAI_API_KEY=...`.
3. Start the app with `npm run dev`.
4. Open the workspace and submit a typed resident note.

## Product v1 Routes

- `POST /api/compile` with `{ "note": string }`: compiles the note with resident profile and historical memory always included.
- `GET /api/resident`: returns local JSON-backed resident profile and history for the workspace.
- `POST /api/transcribe`: transcribes optional microphone input into note text.
- `POST /api/realtime/session`: creates an OpenAI Realtime client-secret session for browser voice interaction without exposing the server API key.

## Safety Contract

- CareOS does not diagnose, prescribe, suggest dosage changes, or make autonomous care decisions.
- Drift flags must cite patient-memory or history evidence with verbatim note quotes.
- Unsupported citations are removed before the response is returned.
- The workspace warns on unsafe clinical language and asks nurses to verify missing checks instead of treating model output as an order.
