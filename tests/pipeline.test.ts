import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readCachedCompile, writeCachedCompile, loadHistory, loadResident } from "../src/lib/data";
import { CompileEnvelopeSchema, CompileResultSchema, type CompileResult } from "../src/lib/schema";
import { buildCompileInput, compileFromBody } from "../src/lib/compile";
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
    const envelope = { result: validResult, verified: true, warnings: [], latencyMs: 12, cached: false };
    expect(CompileEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });
});

describe("data fixtures", () => {
  it("includes gait and medication-refusal demo patterns", async () => {
    const history = await loadHistory();
    expect(history.some((entry) => entry.text.includes("slower than baseline"))).toBe(true);
    expect(history.some((entry) => entry.text.includes("refused"))).toBe(true);
    expect(history.some((entry) => entry.text.includes("corridor"))).toBe(true);
  });

  it("loads resident data", async () => {
    await expect(loadResident()).resolves.toMatchObject({ name: "Default Resident" });
  });
});

describe("cache helpers", () => {
  it("writes and reads mode cache envelopes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "careos-cache-"));
    globalThis.process.chdir(dir);
    const envelope = CompileEnvelopeSchema.parse({ result: validResult, verified: true, warnings: [], latencyMs: 1, cached: false });

    await writeCachedCompile("on", envelope);
    await expect(readCachedCompile("on")).resolves.toEqual(envelope);
    globalThis.process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
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
    name: "Default Resident",
    age: 84,
    room: "A-101",
    baseline_traits: ["slow gait"],
    timezone: "Asia/Tokyo",
    language: "ja",
  };
  const history = [{ note_id: "note-001", date: "2026-07-01", shift: "day", author: "Yamada", text: "History" }];

  it("assembles OFF input with the note only and empty context", () => {
    const off = JSON.parse(buildCompileInput({ note: "New note", mode: "off", resident, history }));
    expect(off.current_note).toBe("New note");
    expect(off.context.resident).toBeNull();
    expect(off.context.history).toEqual([]);
    expect(off.context.instruction).toContain("context_the_note_missed empty");
    expect(off.context.instruction).toContain("note itself explicitly states a change");
    expect(off.output_contract).toContain('note_id to "live"');
  });

  it("assembles ON input with resident and all history", () => {
    const on = JSON.parse(buildCompileInput({ note: "New note", mode: "on", resident, history }));
    expect(on.context.resident).toEqual(resident);
    expect(on.context.history).toEqual(history);
    expect(on.context.instruction).toContain("verbatim historical citations");
  });

  it("returns cached demo data when the key is missing", async () => {
    globalThis.process.env.OPENAI_API_KEY = "";
    const envelope = await compileFromBody({ note: "Local note", mode: "off" }, { hasOpenAIKey: false });
    expect(envelope.cached).toBe(true);
    expect(envelope.result.drift_flags).toEqual([]);
  });
});
