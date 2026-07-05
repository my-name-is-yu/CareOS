# CareOS — Technical Architecture (hackathon build)

Target: localhost demo. Single process, no database, OpenAI API + Agents SDK.
Design doc (product/pitch/timeboxes): `~/.gstack/projects/my-name-is-yu-De-dimentia/yuyoshimuta-main-design-20260705-111519.md`

## Stack decision

- **Next.js (App Router) + TypeScript** — ONE dev server on `localhost:3000`, frontend and API in the same process. No CORS, no proxy, one `npm run dev`. This is the single biggest integration-risk killer.
- **`@openai/agents`** (OpenAI Agents SDK, JS) in API routes — agent definition with a zod `outputType`, so the model is forced into our frozen schema and the SDK validates/retries.
- **`zod`** — one schema, shared by the agent output type AND the UI props. The Track 1 ↔ Track 2 contract is a TypeScript type, not a conversation.
- **Models:** `gpt-4o-transcribe` for STT; **`gpt-4o` for BOTH modes** (ON and OFF). On stage we say "same note, same model — the only difference is memory." Keep it true.
- **Storage: JSON files on disk.** `data/history.json` is the resident's memory. No DB, no ORM, nothing to migrate.

## System diagram

```
Browser (localhost:3000)
│
├── NoteInput ── MediaRecorder(webm) ──► POST /api/transcribe ──► OpenAI audio API
│        └── typed-note textarea (fallback path, built FIRST)
│
├── on transcript ready: fire BOTH in parallel
│      ├──► POST /api/compile {note, mode:"off"} ─► Agent (note only)
│      └──► POST /api/compile {note, mode:"on"}  ─► Agent (note + profile + 3-week history)
│                                                      │
│                                    post-process (plain code, not LLM):
│                                      1. verifyCitations()  substring match vs history
│                                      2. lintClinical()     keyword guard
│                                      3. writeCache()       data/cache/{mode}.json
│
└── ShiftView renders: OFF = summary card ("what recorders ship today")
                       ON  = handoff brief + drift flags w/ expandable citations
    [F] key = swap in cached rehearsal result (the open escape hatch)
```

## Frozen schema (single source of truth: `src/lib/schema.ts`)

```ts
import { z } from "zod";

export const Citation = z.object({
  note_id: z.string(),
  quote: z.string(), // must be VERBATIM from the source note — verified in code
});

export const CompileResult = z.object({
  observations: z.array(z.object({
    category: z.enum(["gait","sleep","appetite","agitation","medication","social","other"]),
    text: z.string(),
    note_id: z.string(), // "live" for the new note
  })),
  drift_flags: z.array(z.object({
    claim: z.string(),
    severity: z.enum(["watch","attention"]),
    citations: z.array(Citation), // empty after verification ⇒ flag not rendered
  })),
  handoff_brief: z.object({
    summary: z.string(),
    watch_items: z.array(z.string()),
    context_the_note_missed: z.array(z.string()), // the "aha" field — only populated in ON mode
  }),
});
export type CompileResult = z.infer<typeof CompileResult>;
```

## File layout

```
careos/
├─ .env.local                 # OPENAI_API_KEY=...   (verify BEFORE the clock starts)
├─ data/
│  ├─ resident.json           # profile: name, age, room, baseline traits
│  ├─ history.json            # ~20 dated notes: [{note_id, date, shift, author, text}]
│  └─ cache/                  # on.json / off.json — last successful run (demo fallback)
├─ src/
│  ├─ lib/
│  │  ├─ schema.ts            # zod schema above (Track 1+2 shared contract)
│  │  ├─ agent.ts             # CareCompiler agent + ON/OFF prompt assembly
│  │  ├─ verify.ts            # citation substring check + one corrective re-run
│  │  ├─ lint.ts              # clinical-language keyword guard
│  │  └─ data.ts              # load resident/history, read/write cache
│  ├─ app/
│  │  ├─ page.tsx             # the single screen
│  │  └─ api/
│  │     ├─ transcribe/route.ts
│  │     ├─ compile/route.ts
│  │     └─ resident/route.ts # serves profile+history to the UI
│  └─ components/
│     ├─ NoteInput.tsx        # mic + typed fallback + transcript display
│     ├─ ModeToggle.tsx       # the big MEMORY OFF/ON switch
│     ├─ ShiftView.tsx        # brief + watch items + context_the_note_missed
│     ├─ DriftFlag.tsx        # claim + severity + expandable verified citations
│     └─ stretch/             # Timeline.tsx, IncidentReport.tsx — DO NOT build before gate
```

## Agent design (`src/lib/agent.ts`)

One agent, no tools, judgment happens in one structured pass; determinism (verification, lint, caching) lives in plain code around it. Agents SDK usage is real but minimal — resist multi-agent theater.

```ts
import { Agent, run } from "@openai/agents";
import { CompileResult } from "./schema";

const GUARDRAILS = `You produce OPERATIONAL care documentation for human review.
Never diagnose, never name diseases or conditions, never suggest medication or
dosage changes. You compare observations and cite sources; humans decide care.
Every citation quote MUST be copied verbatim from the source note text.`;

export const careCompiler = new Agent({
  name: "CareCompiler",
  model: "gpt-4o",
  instructions: GUARDRAILS, // + mode-specific block, see buildInput()
  outputType: CompileResult,
});
```

**Input assembly (the ONLY difference between modes):**

- `mode:"off"` → instructions + the new note. Prompt: "Summarize this care note into the schema. You have no other information. Leave `context_the_note_missed` empty, emit drift_flags only if the note itself states a change."
- `mode:"on"` → instructions + `resident.json` + all of `history.json` (~20 notes, fits trivially in context) + the new note. Prompt: "Compare the new note against the resident's history. Flag deviations from baseline in `drift_flags`, citing the specific historical notes (verbatim quotes + note_id). In `context_the_note_missed`, list what the incoming night shift must know that this note alone does not say."

## Post-processing (plain code — `verify.ts`, `lint.ts`)

```
verifyCitations(result, history):
  for each drift_flag.citation:
     normalized substring match of quote against history[note_id].text
     (case-insensitive, whitespace-collapsed)
  unverified → drop citation; flag with 0 verified citations → drop flag
  if a flag was dropped AND drift_flags is now empty:
     ONE corrective re-run: append "Your previous citations were not verbatim.
     Quote exactly from the notes." → re-verify → still failing? return
     {verified:false} so the UI shows the [F] cached-fallback hint to the operator
```

```
lintClinical(result):
  keyword scan on all string fields: /diagnos|prescri|dosage|disease|
  parkinson|alzheim|progression of dementia/i ...
  hits → returned as warnings[]; UI shows an amber operator badge (never render-blocking,
  but the operator sees it BEFORE pointing the projector at it)
```

**API response envelope:** `{ result, verified: boolean, warnings: string[], latencyMs, cached: boolean }`

## Demo-critical behaviors (build these, they're in the script)

1. **Parallel fire:** the moment a transcript exists, the frontend sends OFF and ON requests simultaneously. OFF renders first (script beat 3), ON reveals on toggle (beat 4).
2. **Cache every success:** `/api/compile` writes its response to `data/cache/{mode}.json`. Keyboard `F` swaps the current pane to cached — this is the rehearsed, openly-announced escape hatch for BOTH failure modes (latency >10s or `verified:false`).
3. **Typed-note path works end-to-end before the mic exists.** Mic is an enhancement of a working demo, not a dependency of it.
4. **Loading state is narration time:** while compiling, ShiftView shows the resident's history scrolling ("21 days of memory") — the presenter talks over it by design.

## Track assignment

- **Track 1 (pipeline, 1-2 people):** `lib/` + `api/`. Order: schema.ts → data.ts → agent.ts + compile route (typed input, both modes) → verify.ts → lint.ts → transcribe route (mic last). Safeguards get a fixed ~25-min timebox; core pipeline first.
- **Track 2 (UI, 1 person):** `components/` + `page.tsx`, built against `data/cache/fixture-on.json` / `fixture-off.json` (hand-written to schema) so UI never waits on Track 1. Wire to live API only at the 2:30 smoke test.
- **Track 3 (founder):** `data/history.json` authoring (2 embedded patterns: progressive gait change; med refusal with unfamiliar staff + noise), demo script, pitch. First 5 notes delivered by 0:35.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Mic permission / format fails on demo machine | Typed path first; test mic on THE demo laptop at smoke test, not after |
| gpt-4o structured-output latency on stage | Parallel fire + narration beat + `F` cached fallback |
| Citations not verbatim (model paraphrases) | verify.ts + one corrective re-run + fallback path |
| API key/quota surprise | Hit `/api/compile` with a curl test before minute 0:20 ends |
| Schema drift between tracks | schema.ts is the only definition; both tracks import it; frozen at 0:20 |
```

