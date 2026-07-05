# CareOS

CareOS Product v1 is a nurse-facing dementia-care workspace for turning shift observations into memory-backed handoff support. The product helps staff compare a current observation against patient memory, verify cited evidence, and surface missing nursing checks for human review.

## Setup

1. Install dependencies with `npm install`.
2. Create `.env.local` with `OPENAI_API_KEY=...`.
3. Start the app with `npm run dev`.
4. Open the workspace, connect the Realtime care agent if microphone support is needed, or submit a typed resident observation.

## Product v1 Routes

- `GET /api/resident`: returns resident identity, history, and patient memory for the workspace.
- `POST /api/compile` with `{ "note": string }`: compiles the note with resident profile, patient memory, and historical notes always included.
- `POST /api/realtime/session`: creates an OpenAI Realtime ephemeral client secret and returns `{ clientSecret: { value, expiresAt } }` without exposing the server API key.

## Patient Memory

`data/resident.json` contains resident identity fields plus a nested `memory` object. `loadResident()` returns only identity fields, and `loadMemory()` returns the Product v1 patient memory: baseline, communication cues, preferences, known triggers, calming approaches, family/context notes, recent history, and watch patterns. Compile and Realtime agent instructions always include this memory together with historical note evidence.

## Safety Contract

- CareOS does not diagnose, prescribe, suggest dosage changes, or make autonomous care decisions.
- Drift flags must cite historical note evidence with verbatim note quotes.
- Unsupported citations are removed before the response is returned.
- The workspace warns on unsafe clinical language and asks nurses to verify missing checks instead of treating model output as an order.
