# CareOS Product v1 Architecture

CareOS is a Next.js App Router application for a nurse-facing dementia-care workspace. Product v1 keeps the production path narrow: typed observations enter one memory-backed compile pipeline, patient memory is loaded from local JSON storage, and browser voice conversation uses OpenAI Realtime ephemeral client secrets generated server-side.

## Runtime Shape

```text
Browser workspace
  |-- GET /api/resident
  |     |-- resident identity
  |     |-- historical notes
  |     |-- patient memory
  |
  |-- typed observation
  |-- POST /api/compile { note }
  |     |-- load data/resident.json
  |     |-- split resident identity and nested patient memory
  |     |-- load data/history.json
  |     |-- run CareCompiler with memory always included
  |     |-- verify verbatim historical citations
  |     |-- warn on unsafe clinical language
  |
  |-- POST /api/realtime/session
        |-- load resident, memory, and history into server instructions
        |-- OpenAI SDK realtime.clientSecrets.create()
        |-- returns { clientSecret: { value, expiresAt } }
```

## Storage

Product v1 uses JSON-backed local persistence:

- `data/resident.json` stores identity fields plus nested Product v1 patient memory.
- `loadResident()` returns only identity fields: name, age, room, timezone, and language.
- `loadMemory()` returns nested memory: baseline, communication cues, preferences, known triggers, calming approaches, family/context notes, recent history, and watch patterns.
- `data/history.json` stores shift-note history used for citation evidence.

This storage boundary is intentionally simple for v1. A database, auth, and EHR integration can replace the local JSON boundary later without changing the application contract.

## Compile Pipeline

`POST /api/compile` accepts `{ "note": string }`. The server rejects empty notes and requires `OPENAI_API_KEY` for model execution. The compile input always includes:

- the current note,
- resident identity,
- patient memory fields,
- all local historical notes,
- instructions to surface missing nursing checks,
- the shared `CompileResult` schema from `src/lib/schema.ts`.

The model returns observations, drift flags, and a handoff brief. Observations from the current note use `note_id: "live"`; observations or drift evidence from history use historical note IDs. Patient memory guides comparison, while drift citations require verbatim historical note evidence.

## Realtime Voice Boundary

Browser voice interaction uses `@openai/agents-realtime` in the client and `POST /api/realtime/session` on the server. The route loads resident identity, patient memory, and historical notes, builds dementia-care nursing instructions, then calls `openai.realtime.clientSecrets.create` for `gpt-realtime-2`. The browser connects WebRTC SDP to `https://api.openai.com/v1/realtime/calls` with the returned ephemeral key.

The route returns only:

```ts
{
  clientSecret: {
    value: string;
    expiresAt: number;
  };
}
```

The value must start with `ek_`, and `OPENAI_API_KEY` never leaves the server route.

## Safety Guardrails

CareOS output is operational handoff support for licensed staff, not medical authority.

- No diagnosis.
- No prescriptions or medication/dosage changes.
- No autonomous care decisions.
- Drift flags require verbatim citations from historical notes.
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

`verified: false` means one or more citations were dropped or a drift flag could not be fully supported by historical note evidence.
