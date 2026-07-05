# CareOS Product v1 Architecture

CareOS is a Next.js App Router application for a nurse-facing dementia-care workspace. Product v1 keeps the production path narrow: typed or voice-captured notes enter one memory-backed compile pipeline, patient memory is loaded from local JSON storage, and browser voice uses OpenAI Realtime ephemeral client secrets generated server-side.

## Runtime Shape

```
Browser workspace
  |-- typed note or transcribed note
  |-- POST /api/compile { note }
  |     |-- load data/resident.json
  |     |-- split resident identity and nested patient memory
  |     |-- load data/history.json
  |     |-- run CareCompiler with memory always included
  |     |-- verify verbatim historical citations
  |     |-- warn on unsafe clinical language
  |
  |-- POST /api/realtime/session
        |-- OpenAI SDK realtime.clientSecrets.create()
        |-- returns { clientSecret: { value, expiresAt } }
```

## Storage

Product v1 uses JSON-backed local persistence:

- `data/resident.json` stores identity fields plus nested Product v1 patient memory.
- `loadResident()` returns only identity fields: name, age, room, timezone, and language.
- `loadMemory()` returns nested memory: baseline, communication cues, preferences, known triggers, calming approaches, family/context notes, recent history, and watch patterns.
- `data/history.json` stores shift-note history used for citation evidence.

This storage boundary is intentionally simple for v1. Database schema and API expansion belong to the main data lane.

## Compile Pipeline

`POST /api/compile` accepts `{ "note": string }`. The server rejects empty notes and requires `OPENAI_API_KEY` for model execution. The compile input always includes:

- the current note,
- resident identity,
- patient memory fields,
- all local historical notes,
- instructions to surface missing nursing checks,
- the shared `CompileResult` schema from `src/lib/schema.ts`.

There is no memory-disabled compile path in Product v1. The model must return observations, drift flags, and a handoff brief. Observations from the current note use `note_id: "live"`; observations or drift evidence from history use historical note IDs. Patient memory guides comparison, but drift citations still need verbatim historical note evidence.

## Realtime Voice Boundary

Browser voice interaction uses the OpenAI Realtime Agents SDK path through `POST /api/realtime/session`. The route creates an ephemeral client secret with the installed OpenAI SDK API, `openai.realtime.clientSecrets.create`, and returns `{ clientSecret: { value, expiresAt } }` to the browser. The value must start with `ek_`, and the server `OPENAI_API_KEY` never leaves the server route.

## Safety Guardrails

CareOS output is operational handoff support for licensed staff, not medical authority.

- No diagnosis.
- No prescriptions or medication/dosage changes.
- No autonomous care decisions.
- Drift flags require verbatim citations from patient memory or history.
- Unsupported citations are removed from returned drift flags.
- Clinical-risk language is returned as warnings for nurse review.
- Missing checks are surfaced as items for staff to verify, not as directives.

## API Envelope

`/api/compile` returns:

```ts
{
  result: CompileResult;
  verified: boolean;
  warnings: string[];
  latencyMs: number;
}
```

`verified: false` means one or more citations were dropped or a drift flag could not be fully supported by patient-memory evidence.
