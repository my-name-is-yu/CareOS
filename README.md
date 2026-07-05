# CareOS

CareOS Product v1 is a nurse-facing dementia-care workspace for turning shift observations into memory-backed handoff support. The product helps staff compare a current observation against patient memory, verify cited evidence, and surface missing nursing checks for human review.

## Setup

1. Install dependencies with `npm install`.
2. Create `.env.local` with `OPENAI_API_KEY=...`.
3. Start the app with `npm run dev`.
4. Open the workspace, connect the Realtime care agent if microphone support is needed, or submit a typed resident observation.

Optional G-Brain-backed memory:

```env
CAREOS_MEMORY_BACKEND=gbrain
GBRAIN_OPERATION=search
GBRAIN_TIMEOUT_MS=4000
OPENAI_API_KEY=...
```

For the local hackathon setup, install and initialize G-Brain, then import the bundled synthetic patient brain. `GBRAIN_OPERATION` defaults to `search`; set it to `think` if you want CareOS to pass G-Brain's synthesized answer instead of raw search output.

```bash
bun install -g github:garrytan/gbrain
gbrain init --pglite
gbrain import brain
gbrain search "Aiko Mori medication refusal corridor noise"
```

## Product v1 Routes

- `GET /api/resident`: returns resident identity, history, and patient memory for the workspace.
- `POST /api/compile` with `{ "note": string }`: compiles the note with resident profile, patient memory, and historical notes always included.
- `POST /api/realtime/session`: creates an OpenAI Realtime ephemeral client secret and returns `{ clientSecret: { value, expiresAt } }` without exposing the server API key.

## Patient Memory

`data/resident.json` contains resident identity fields plus a nested `memory` object. `loadResident()` returns only identity fields, and `loadMemory()` returns the Product v1 patient memory: baseline, communication cues, preferences, known triggers, calming approaches, family/context notes, recent history, and watch patterns. Compile and Realtime agent instructions always include this memory together with historical note evidence.

When `CAREOS_MEMORY_BACKEND=gbrain` is set, CareOS queries the local G-Brain CLI for resident-specific knowledge and passes the full returned G-Brain context into compile and Realtime prompts. The app does not extract selected G-Brain sections into a custom memory store. The existing `PatientMemory` fields remain as display/fallback data from `data/resident.json`. The `brain/` directory is the import source for G-Brain, not a parallel runtime database. If G-Brain is missing, times out, or returns no usable resident knowledge, CareOS falls back to JSON-only memory so the demo path stays available.

## Safety Contract

- CareOS does not diagnose, prescribe, suggest dosage changes, or make autonomous care decisions.
- Drift flags must cite historical note evidence with verbatim note quotes.
- Unsupported citations are removed before the response is returned.
- The workspace warns on unsafe clinical language and asks nurses to verify missing checks instead of treating model output as an order.
