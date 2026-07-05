import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { assembleCompileInput } from "../src/lib/agent";
import { readCachedCompile, writeCachedCompile } from "../src/lib/data";
import { lintClinicalLanguage } from "../src/lib/lint";
import { CompileEnvelopeSchema, CompileResultSchema, type CompileResult } from "../src/lib/schema";
import { normalizeCitationText, verifyCompileResult } from "../src/lib/verify";
import { compileFromBody } from "../src/lib/compile";
import { transcribeFormData } from "../src/lib/transcribe";

const originalCwd = process.cwd();
const originalKey = process.env.OPENAI_API_KEY;

afterEach(async () => {
  process.chdir(originalCwd);
  process.env.OPENAI_API_KEY = originalKey;
  vi.restoreAllMocks();
});

const validResult: CompileResult = {
  observations: [{ category: "gait", text: "Slower gait observed.", note_id: "note-001" }],
  drift_flags: [
    {
      claim: "Gait slowness is recurring.",
      severity: "watch",
      citations: [{ note_id: "note-001", quote: "walked slower than baseline" }],
    },
  ],
  handoff_brief: {
    summary: "Monitor mobility.",
    watch_items: ["mobility"],
    context_the_note_missed: ["Prior gait slowness exists."],
  },
};

describe("pipeline schema", () => {
  it("parses the frozen CompileResult shape", () => {
    expect(CompileResultSchema.parse(validResult)).toEqual(validResult);
  });

  it("parses the API envelope shape", () => {
    const envelope = { result: validResult, verified: true, warnings: [], latencyMs: 12, cached: false };
    expect(CompileEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });
});

describe("citation verification", () => {
  const history = [
    {
      note_id: "note-001",
      date: "2026-07-01",
      shift: "day",
      author: "Yamada",
      text: "Resident walked slower than baseline after lunch.",
    },
  ];

  it("normalizes whitespace, case, and smart quotes", () => {
    expect(normalizeCitationText("  “Walked   SLOWER”  ")).toBe("\"walked slower\"");
  });

  it("drops unverified citations and flags with no verified citations", () => {
    const result = verifyCompileResult(
      {
        ...validResult,
        drift_flags: [
          {
            claim: "Supported.",
            severity: "watch",
            citations: [
              { note_id: "note-001", quote: "walked slower than baseline" },
              { note_id: "note-999", quote: "not present" },
            ],
          },
          {
            claim: "Unsupported.",
            severity: "attention",
            citations: [{ note_id: "note-001", quote: "not present" }],
          },
        ],
      },
      history,
    );

    expect(result.verified).toBe(false);
    expect(result.droppedCitations).toBe(2);
    expect(result.droppedFlags).toBe(1);
    expect(result.result.drift_flags).toHaveLength(1);
    expect(result.result.drift_flags[0]?.citations).toEqual([{ note_id: "note-001", quote: "walked slower than baseline" }]);
  });
});

describe("lint warnings", () => {
  it("warns without blocking clinical language", () => {
    expect(lintClinicalLanguage({ summary: "Diagnose dementia and prescribe medication." })).toEqual([
      "Review language for clinical, diagnostic, or prescribing claims.",
    ]);
  });

  it.each([
    "Consider a diagnosis of vascular issues.",
    "Prescribing a new plan for the resident.",
    "Increase the dosage per the chart.",
    "Signs of underlying disease noted.",
    "Symptoms consistent with parkinson's.",
    "Behavior consistent with alzheimer's.",
    "Notable progression of dementia this week.",
  ])("warns on spec keyword: %s", (text) => {
    expect(lintClinicalLanguage({ summary: text })).toEqual([
      "Review language for clinical, diagnostic, or prescribing claims.",
    ]);
  });

  it("does not warn on clean operational language", () => {
    expect(lintClinicalLanguage({ summary: "Resident had a calm afternoon and ate well." })).toEqual([]);
  });
});

describe("cache helpers", () => {
  it("writes and reads mode cache envelopes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "careos-cache-"));
    process.chdir(dir);
    const envelope = CompileEnvelopeSchema.parse({ result: validResult, verified: true, warnings: [], latencyMs: 1, cached: false });

    await writeCachedCompile("on", envelope);
    await expect(readCachedCompile("on")).resolves.toEqual(envelope);
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  });
});

describe("compile route helpers", () => {
  const resident = {
    name: "Default Resident",
    age: 84,
    room: "A-101",
    baseline_traits: ["slow gait"],
    timezone: "Asia/Tokyo",
    language: "ja",
  };
  const history = [
    {
      note_id: "note-001",
      date: "2026-07-01",
      shift: "day",
      author: "Yamada",
      text: "Resident walked slower than baseline after lunch.",
    },
  ];

  it("assembles OFF input with the note only and empty context", () => {
    const assembled = JSON.parse(assembleCompileInput({ note: "New note", mode: "off", resident, history }));
    expect(assembled.current_note).toBe("New note");
    expect(assembled.context.history).toEqual([]);
    expect(assembled.context.resident).toBeNull();
    expect(assembled.context.instruction).toContain("context_the_note_missed empty");
    expect(assembled.context.instruction).toContain("note itself explicitly states a change");
    expect(assembled.output_contract).toContain('note_id to "live"');
  });

  it("assembles ON input with resident and all history", () => {
    const assembled = JSON.parse(assembleCompileInput({ note: "New note", mode: "on", resident, history }));
    expect(assembled.context.resident).toEqual(resident);
    expect(assembled.context.history).toEqual(history);
    expect(assembled.context.instruction).toContain("verbatim historical citations");
  });

  it("returns cached demo data when the key is missing", async () => {
    process.env.OPENAI_API_KEY = "";
    const envelope = await compileFromBody({ note: "Local note", mode: "off" }, { hasOpenAIKey: false });
    expect(envelope.cached).toBe(true);
    expect(envelope.result.drift_flags).toEqual([]);
  });
});

describe("transcribe helper", () => {
  it("returns a clean error for missing audio", async () => {
    await expect(transcribeFormData(new FormData(), "test-key")).rejects.toThrow("Missing audio upload.");
  });

  it("returns a clean error for missing key", async () => {
    const formData = new FormData();
    formData.set("audio", new File(["audio"], "clip.webm", { type: "audio/webm" }));
    await expect(transcribeFormData(formData, "")).rejects.toThrow("OPENAI_API_KEY is required for transcription.");
  });
});
