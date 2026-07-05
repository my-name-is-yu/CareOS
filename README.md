# MemoryPath

_(repo: CareOS)_

> MemoryPath uses GBrain, built with the Agents SDK, to continuously learn from fragmented dementia care records and generate a Living Care Profile that helps every caregiver provide personalized care in seconds.

## The problem

Years of patient knowledge end up buried across hundreds of SOAP notes, nurse observations, family memories, medication records, and incident reports. Every new caregiver — every new shift, every agency nurse, every float staff member — has to start from scratch, re-reading a stack of fragmented notes to figure out what actually works for this resident.

MemoryPath is not an AI chatbot. It is a system that automatically prepares the work a nurse already has to do — reviewing new records, spotting what changed, learning what calms and what triggers a resident — while the nurse reviews and approves every change before it becomes part of the record.

## What the next nurse gets

Instead of reading hundreds of notes, the next nurse instantly gets:

1. **Who this resident is** — background, personality, what matters to them.
2. **What changed recently** — deviations from baseline, with citations to the source records.
3. **What calms or triggers them** — calming approaches and known triggers learned from records.
4. **Personalized care recommendations** — the accumulated "what works for this resident," operational support rather than medical judgment.
5. **A shift handoff brief** — auto-generated from the approved profile and recent records.
6. **Behavior trend flags** — long-term pattern shifts, flagged with verbatim citations.

All six are surfaced from a single artifact: the **Living Care Profile** — versioned, cited, and never updated without a nurse's approval.

## Setup

1. Install dependencies: `npm install`.
2. Create `.env.local` with:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   ```
3. Start the app: `npm run dev`.
4. Open the workspace to submit care records, generate profile update proposals, review/approve them in the Next Nurse view, and optionally connect the Realtime voice agent.

### Optional: GBrain-backed memory

By default MemoryPath runs entirely on the local JSON stores under `data/`. Set `CAREOS_MEMORY_BACKEND=gbrain` to also treat GBrain as a long-term knowledge layer that the reasoning pipeline consults:

```env
CAREOS_MEMORY_BACKEND=gbrain
GBRAIN_OPERATION=search
GBRAIN_TIMEOUT_MS=4000
OPENAI_API_KEY=...
```

Install and initialize GBrain, then import the bundled synthetic patient brain:

```bash
bun install -g github:garrytan/gbrain
gbrain init --pglite
gbrain import brain
gbrain search "Aiko Mori medication refusal corridor noise"
```

With `CAREOS_MEMORY_BACKEND=gbrain` set, every new care record is also written to `brain/residents/records/<record-id>.md` and re-imported into GBrain as it is appended (`POST /api/records`), so GBrain's knowledge stays current with the append-only record store. `GBRAIN_OPERATION` defaults to `search`; set it to `think` to have MemoryPath pass GBrain's synthesized answer instead of raw search output. If GBrain is missing, times out, or fails for any reason, MemoryPath falls back to JSON-only reasoning so the app keeps working.

## API routes

- `GET /api/resident` — resident identity, the latest approved Living Care Profile, and recent care records, for the workspace UI.
- `POST /api/records` — appends a new `CareRecord` (SOAP note, nurse observation, family memory, medication record, or incident report) to the append-only store, then best-effort syncs it to GBrain.
- `GET /api/records` — lists all care records for the resident, most recent first.
- `POST /api/proposals/generate` — runs the reasoning pipeline against new (or explicitly listed) records and the current profile, verifies citations, and saves a `ProfileUpdateProposal` awaiting nurse review.
- `GET /api/proposals` — lists all proposals for the resident, most recent first.
- `POST /api/proposals/[id]/approve` — applies a proposal's changes (or nurse-edited changes) to the Living Care Profile, creating the next version.
- `POST /api/proposals/[id]/reject` — marks a proposal rejected; the profile is left untouched.
- `POST /api/realtime/session` — creates an OpenAI Realtime ephemeral client secret, grounded on the approved profile and recent records, without exposing the server API key.

## Data & stores

- `data/records.json` — the append-only `CareRecord` store. Records are immutable once written; every profile field's citations point back into this file.
- `data/profiles/<residentId>/vN.json` — the versioned Living Care Profile. Each nurse approval writes a new, immutable version file; nothing is ever overwritten in place.
- `data/proposals.json` — every `ProfileUpdateProposal` ever generated, with its status (`proposed`, `approved`, `rejected`, or `edited_and_approved`).

## Safety Contract

- MemoryPath does not diagnose, prescribe, suggest dosage changes, or make autonomous care decisions.
- Every proposed profile change must carry **verbatim citations** back to source care records; citations (and, for structured fields, individual list items) that can't be verified against a record's body are dropped before a proposal is ever shown to a nurse.
- **The Living Care Profile never changes without nurse approval.** The reasoning pipeline only ever produces a proposal; applying it to the profile requires an explicit `POST /api/proposals/[id]/approve` call.
- Unsafe clinical language (diagnosis, prescribing, dosage, disease-naming, or "no nurse review needed" phrasing) is surfaced as a warning for the reviewing nurse, never silently dropped or treated as an order.
