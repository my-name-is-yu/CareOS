import { afterEach, describe, expect, it, vi } from "vitest";

import { loadHistory, loadMemory, loadResident } from "../src/lib/data";
import { CompileEnvelopeSchema, CompileResultSchema, type CompileResult } from "../src/lib/schema";
import { buildCompileInput, compileFromBody, CompileRequestBodySchema } from "../src/lib/compile";
import { lintClinicalLanguage } from "../src/lib/lint";
import { normalizeCitationText, verifyCompileResult } from "../src/lib/verify";

const originalCwd = globalThis.process.cwd();
const originalKey = globalThis.process.env.OPENAI_API_KEY;

afterEach(async () => {
  globalThis.process.chdir(originalCwd);
  globalThis.process.env.OPENAI_API_KEY = originalKey;
  vi.restoreAllMocks();
});

const validResult: CompileResult = {
  observations: [{ category: "gait", text: "Slower gait observed.", note_id: "note-001" }],
  drift_flags: [],
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
    const envelope = { result: validResult, verified: true, warnings: [], latencyMs: 12 };
    expect(CompileEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });
});

describe("patient memory data", () => {
  it("includes gait and medication-refusal history patterns", async () => {
    const history = await loadHistory();
    expect(history.some((entry) => entry.text.includes("slower than baseline"))).toBe(true);
    expect(history.some((entry) => entry.text.includes("refused"))).toBe(true);
    expect(history.some((entry) => entry.text.includes("corridor"))).toBe(true);
  });

  it("loads resident data", async () => {
    const resident = await loadResident();
    expect(resident).toEqual({
      name: "Aiko Mori",
      age: 84,
      room: "A-101",
      timezone: "Asia/Tokyo",
      language: "ja",
    });
    expect(resident).not.toHaveProperty("memory");
  });

  it("loads patient memory with operational care fields", async () => {
    await expect(loadMemory()).resolves.toMatchObject({
      baseline: expect.arrayContaining([expect.stringContaining("walker")]),
      communication_cues: expect.arrayContaining([expect.stringContaining("short sentences")]),
      preferences: expect.arrayContaining([expect.stringContaining("door partly closed")]),
      known_triggers: expect.arrayContaining([expect.stringContaining("Corridor noise")]),
      calming_approaches: expect.arrayContaining([expect.stringContaining("Lower room noise")]),
      family_context_notes: expect.arrayContaining([expect.stringContaining("Mika")]),
      recent_history: expect.arrayContaining([expect.stringContaining("slower gait")]),
      watch_patterns: expect.arrayContaining([expect.stringContaining("medication refusal")]),
    });
  });
});

describe("citation verification", () => {
  it("normalizes whitespace and quotes", () => {
    expect(normalizeCitationText("  “Walked   SLOWER”  ")).toBe("\"walked slower\"");
  });

  it("drops unverifiable citations", () => {
    const result = verifyCompileResult(
      {
        ...validResult,
        drift_flags: [
          {
            claim: "Supported",
            severity: "watch",
            citations: [{ note_id: "note-001", quote: "Slower gait observed." }],
          },
          {
            claim: "Unsupported",
            severity: "attention",
            citations: [{ note_id: "note-999", quote: "missing" }],
          },
        ],
      },
      [{ note_id: "note-001", text: "Slower gait observed." }],
    );
    expect(result.verified).toBe(false);
    expect(result.result.drift_flags).toHaveLength(1);
  });
});

describe("lint warnings", () => {
  it("warns on diagnostic or prescribing language", () => {
    expect(
      lintClinicalLanguage({
        observations: [],
        drift_flags: [],
        handoff_brief: {
          summary: "Diagnose dementia and prescribe medication.",
          watch_items: [],
          context_the_note_missed: [],
        },
      } satisfies CompileResult),
    ).toEqual([
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

describe("compile route helpers", () => {
  const resident = {
    name: "Aiko Mori",
    age: 84,
    room: "A-101",
    timezone: "Asia/Tokyo",
    language: "ja",
  };
  const memory = {
    baseline: ["slow gait"],
    communication_cues: ["short sentences"],
    preferences: ["quiet room"],
    known_triggers: ["corridor noise"],
    calming_approaches: ["lower room noise"],
    family_context_notes: ["daughter Mika visits"],
    recent_history: ["recent slower gait"],
    watch_patterns: ["medication refusal"],
  };
  const history = [{ note_id: "note-001", date: "2026-07-01", shift: "day", author: "Yamada", text: "History" }];

  it("accepts only the production note request shape", () => {
    expect(CompileRequestBodySchema.parse({ note: "New note" })).toEqual({ note: "New note" });
    expect(() => CompileRequestBodySchema.parse({ note: "New note", extra: true })).toThrow();
  });

  it("rejects blank notes before model execution", async () => {
    await expect(compileFromBody({ note: "   " }, { hasOpenAIKey: true })).rejects.toThrow("Missing note.");
  });

  it("assembles memory-always-on input with resident, memory, and all history", () => {
    const assembled = JSON.parse(buildCompileInput({ note: "New note", resident, memory, history }));
    expect(assembled.current_note).toBe("New note");
    expect(assembled.context.resident).toEqual(resident);
    expect(assembled.context.memory).toEqual(memory);
    expect(assembled.context.history).toEqual(history);
    expect(assembled.context.instruction).toContain("Memory is always on");
    expect(assembled.output_contract).toContain('note_id to "live"');
  });

  it("requires OpenAI for production compile", async () => {
    globalThis.process.env.OPENAI_API_KEY = "";
    await expect(compileFromBody({ note: "Local note" }, { hasOpenAIKey: false })).rejects.toThrow("OPENAI_API_KEY is required.");
  });
});
