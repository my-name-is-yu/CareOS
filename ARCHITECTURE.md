# MemoryPath Architecture

_(repo: CareOS)_

MemoryPath is a Next.js App Router application that turns fragmented dementia-care records into a continuously updated, versioned **Living Care Profile**. The central artifact is not a one-shot compile result but a profile that only ever changes through a cited proposal a nurse reviews and approves. GBrain, when enabled, is the long-term reasoning/knowledge layer rather than an optional fallback store.

## Runtime Shape

```text
Input sources
  |-- SOAP notes, nurse observations (text/voice), family memories,
  |   medication records, incident reports
  v
POST /api/records
  |-- normalize into CareRecord (common schema, src/lib/schema.ts)
  |-- appendRecord() -> data/records.json (append-only, immutable)
  |-- best-effort syncRecordToGBrain() -> brain/residents/records/<id>.md
  |     + `gbrain import` (swallows failure; never blocks the request)
  v
POST /api/proposals/generate
  |-- load resident, all records, new-since-last-approval records,
  |   current Living Care Profile
  |-- optional GBrain knowledge context (CAREOS_MEMORY_BACKEND=gbrain)
  |-- ProfileReasoningAgent (src/lib/profile-agent.ts, Agents SDK + OpenAI):
  |     1. long-term pattern extraction
  |     2. change detection vs. current profile
  |     3. calming-approach / trigger learning
  |     4. care-recommendation learning
  |     5. trend-flag generation
  |-- verifyProposalChanges() (src/lib/verify.ts): drop any citation whose
  |   quote is not found verbatim (normalized) in its cited record body;
  |   drop a change/list-item entirely if it has zero valid citations left
  |-- if everything was dropped, rerun once with a corrective instruction
  |-- lintClinicalLanguage() (src/lib/lint.ts): warn on unsafe language
  |-- ProfileUpdateProposal saved to data/proposals.json, status "proposed"
  |   (profile itself is untouched)
  v
Nurse review (NextNurseView / ProposalReview components)
  |-- proposal shown as a per-field diff (before / after / citations / rationale)
  |-- nurse approves, edits-then-approves, or rejects
  v
POST /api/proposals/[id]/approve   (or /reject)
  |-- staleness guard: baseVersion must match the current latest profile version
  |-- applyProposalToProfile() -> next version N+1, only touched fields change
  |-- saveProfileVersion() -> data/profiles/<residentId>/v{N+1}.json (new file,
  |   never overwrites an existing version)
  |-- proposal status -> "approved" / "edited_and_approved" / "rejected"
  v
Delivery surfaces (approved profile only)
  |-- Next Nurse view: person summary, recent changes, calming approaches,
  |   known triggers, care recommendations, handoff brief, trend flags
  |-- Shift handoff brief
  |-- Realtime voice agent, grounded on the latest approved profile + recent
  |   records (POST /api/realtime/session)
```

## Storage

- `data/records.json` — append-only `CareRecord[]`. Each record has `id`, `residentId`, `type` (`soap_note` | `nurse_observation` | `family_memory` | `medication_record` | `incident_report`), `occurredAt`, `author`, and an immutable `body` that is the sole source of truth for citation verification. `legacyNoteId` is retained on migrated `soap_note` records to trace them back to the pre-MemoryPath note history.
- `data/profiles/<residentId>/vN.json` — one immutable file per approved `LivingCareProfile` version. Every field (`personSummary`, `recentChanges`, `calmingApproaches`, `knownTriggers`, `careRecommendations`, `handoffBrief`, `trendFlags`) is a `{ value, citations, updatedInVersion }` triple, so the profile is always a provenance-carrying projection of the append-only record store. `loadLatestProfile()` reads the highest version number present.
- `data/proposals.json` — every `ProfileUpdateProposal` ever generated (whether later approved, edited-and-approved, or rejected), each with `baseVersion`, `triggeredBy` (record ids), per-field `FieldDiff[]`, and `status`.
- `brain/` — the GBrain import source. `brain/residents/aiko-mori.md` is the bundled synthetic seed brain; `brain/residents/records/<id>.md` is generated per new record when `CAREOS_MEMORY_BACKEND=gbrain` is set. GBrain is not read directly by the app outside of the `search`/`think` CLI calls in `src/lib/gbrain.ts`.

Writes to all three JSON stores are atomic (write to a temp file, then `rename`), so a crash mid-write cannot corrupt an existing file.

## Reasoning Pipeline

`generateProposal()` (`src/lib/proposal.ts`) is the only place that produces a `ProfileUpdateProposal`, and it never writes to the profile itself:

1. Determine the record set to reason over: an explicit `recordIds` list, or every record with `occurredAt` after the current profile's `approvedAt`.
2. Optionally resolve GBrain knowledge context (best-effort; failures fall back to `null`).
3. Run `ProfileReasoningAgent` (`src/lib/profile-agent.ts`) once. Its instructions assign it five reasoning roles — pattern extraction, change detection, calming/trigger learning, care-recommendation learning, and trend-flag generation — and require every change (and every item within a structured list field) to carry verbatim citations.
4. `verifyProposalChanges()` checks every citation's quote against the normalized body of its cited record; unverifiable citations are dropped, and a change (or list item) left with zero valid citations is dropped entirely.
5. **Corrective rerun**: if verification drops every change (nothing survives), the agent is re-run once with an added corrective instruction demanding verbatim-only citations. If the second attempt still yields nothing, `generateProposal()` returns `{ proposal: null, verified: false, warnings, latencyMs }` and nothing is persisted to `proposals.json`.
6. `lintClinicalLanguage()` scans the verified changes for diagnostic/prescribing/dosage/autonomous-decision language and returns warnings (surfaced to the nurse, never used to silently alter or block the proposal).
7. If at least one change survives, the proposal is assigned the next id, stamped with `baseVersion` = the current profile version and `triggeredBy` = the record ids reasoned over, saved with `status: "proposed"`, and returned.

## Approval Workflow

- **Staleness guard**: `assertProposalIsCurrent()` (`src/lib/approve.ts`) rejects an approval attempt (409) if the proposal's `baseVersion` no longer matches the latest profile version — i.e. another approval landed first and this proposal's diff no longer applies cleanly.
- **Version bump semantics**: `applyProposalToProfile()` produces `profile.version + 1`. Only the fields present in the applied changes are replaced (value, citations, and `updatedInVersion` all set to the new version); every other field carries over byte-for-byte from the previous version, including its original `updatedInVersion`. This is what makes "what changed since last week" (the `recentChanges` field) a first-class, low-cost product signal rather than a diff computed after the fact.
- **`edited_and_approved`**: a nurse may submit `editedChanges` in the approve request body instead of accepting the proposal's changes verbatim; the resulting profile version is built from the edited changes, and the proposal's terminal status records that it was edited rather than approved as-is.
- **Reject**: `POST /api/proposals/[id]/reject` only flips the proposal's status to `rejected` (after the same staleness/already-resolved checks) and never touches any profile file.

## Realtime Voice Boundary

Mechanics are unchanged from CareOS v1: the browser uses `@openai/agents-realtime`, `POST /api/realtime/session` calls `openai.realtime.clientSecrets.create()` for the `gpt-realtime-2` model, and the response contains only `{ clientSecret: { value, expiresAt } }` — the value must start with `ek_`, and `OPENAI_API_KEY` never leaves the server route.

What changed is the grounding: `buildRealtimeInstructions()` (`src/lib/realtime.ts`) now builds the voice agent's instructions from the latest **approved** Living Care Profile (person summary, recent changes, calming approaches, known triggers, care recommendations, handoff brief, trend flags) plus the most recent care records, instead of the old flat `PatientMemory` + note history. The agent is still instructed to refuse diagnosis, prescribing, medication changes, restraints, or autonomous care decisions, and to draft handoff wording for a licensed staff member to review.

## Safety Guardrails

MemoryPath output is operational caregiving support for licensed staff, not medical authority:

- No diagnosis, no prescriptions, no dosage suggestions, no autonomous care decisions.
- Every proposed profile update requires verbatim citations from source records (`src/lib/verify.ts`); citations that can't be verified are removed before a proposal reaches a nurse.
- **The profile never changes without nurse approval** — the reasoning layer only emits proposals; approval is a separate, explicit, auditable action.
- Clinical-risk language is surfaced as a warning (`src/lib/lint.ts`) for the reviewing nurse, never silently dropped and never treated as an instruction.

## Future Extension Points

- **Database**: the JSON stores in `data/` are an intentionally simple boundary; `records.ts` / `profiles.ts` can be swapped for a real database without changing the application contract (`CareRecord`, `LivingCareProfile`, `ProfileUpdateProposal` stay the same).
- **GBrain remote / MCP**: `src/lib/gbrain.ts` currently shells out to a local `gbrain` CLI; it can be replaced with a remote HTTP or MCP-based GBrain client behind the same `loadGBrainKnowledgeContext()` / `syncRecordToGBrain()` boundary.
- **Auth**: routes currently assume a single resident (`aiko-mori`) and an implicit trusted caregiver; multi-user auth and per-nurse `approvedBy` identity can be layered on without touching the reasoning/verification pipeline.
- **EHR integration**: `CareRecord` is a normalization target designed to accept SOAP notes, medication records, and incident reports from an EHR feed, not just manual entry.
- **Multi-resident**: the data layout (`data/profiles/<residentId>/`) and every store function already take `residentId`, so scaling beyond a single resident is a matter of removing the hardcoded `RESIDENT_ID` constants in the API routes.
