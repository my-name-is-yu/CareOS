import { describe, expect, it, vi } from "vitest";

import { loadHistory, loadResident } from "../src/lib/data";
import { buildCompileInput, compileFromBody } from "../src/lib/compile";
import { lintClinicalLanguage } from "../src/lib/lint";
import { createRealtimeSession } from "../src/lib/realtime-session";
import { CompileEnvelopeSchema, CompileResultSchema, type CompileResult } from "../src/lib/schema";
import { normalizeCitationText, verifyCompileResult } from "../src/lib/verify";

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
  it("parses the Product v1 CompileResult shape", () => {
    expect(CompileResultSchema.parse(validResult)).toEqual(validResult);
  });

  it("parses the API envelope without alternate compile state", () => {
    const envelope = { result: validResult, verified: true, warnings: [], latencyMs: 12 };
    expect(CompileEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });
});

describe("patient memory data", () => {
  it("loads resident memory and historical notes", async () => {
    const [resident, history] = await Promise.all([loadResident(), loadHistory()]);

    expect(resident).toMatchObject({ name: "Default Resident" });
    expect(history.some((entry) => entry.text.includes("slower than baseline"))).toBe(true);
    expect(history.some((entry) => entry.text.includes("refused"))).toBe(true);
    expect(history.some((entry) => entry.text.includes("corridor"))).toBe(true);
  });
});

describe("citation verification", () => {
  it("normalizes whitespace and quotes", () => {
    expect(normalizeCitationText("  “Walked   SLOWER”  ")).toBe("\"walked slower\"");
  });

  it("drops unverifiable citations and keeps supported flags", () => {
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
    expect(result.result.drift_flags[0]?.citations).toEqual([{ note_id: "note-001", quote: "Slower gait observed." }]);
  });
});

describe("clinical safety warnings", () => {
  it("warns on diagnostic, prescribing, dosage, and autonomous-care language", () => {
    const warning = "Review language for clinical, diagnostic, or prescribing claims.";

    for (const text of [
      "Consider a diagnosis of vascular issues.",
      "Prescribing a new plan for the resident.",
      "Increase the dosage per the chart.",
      "Symptoms consistent with parkinson's.",
      "Notable progression of dementia this week.",
      "The resident must administer the medication without nurse review.",
      "No nurse checks needed tonight.",
    ]) {
      expect(lintClinicalLanguage({ summary: text })).toEqual([warning]);
    }
  });

  it("does not warn on clean operational language", () => {
    expect(lintClinicalLanguage({ summary: "Resident had a calm afternoon and ate well." })).toEqual([]);
  });
});

describe("compile entrypoint contract", () => {
  const resident = {
    name: "Default Resident",
    age: 84,
    room: "A-101",
    baseline_traits: ["slow gait"],
    timezone: "Asia/Tokyo",
    language: "ja",
  };
  const history = [{ note_id: "note-001", date: "2026-07-01", shift: "day", author: "Yamada", text: "History" }];

  it("always assembles resident memory and full history", () => {
    const input = JSON.parse(buildCompileInput({ note: "New note", resident, history }));

    expect(input.current_note).toBe("New note");
    expect(input.resident_memory.resident).toEqual(resident);
    expect(input.resident_memory.history).toEqual(history);
    expect(input.resident_memory.instruction).toContain("Memory is always included");
    expect(input.resident_memory.instruction).toContain("missing nursing checks");
    expect(input.output_contract).toContain('note_id to "live"');
  });

  it("requires a server OpenAI key instead of returning local canned output", async () => {
    await expect(compileFromBody({ note: "Local note" }, { hasOpenAIKey: false })).rejects.toThrow("OPENAI_API_KEY is required for compile.");
  });
});

describe("Realtime session boundary", () => {
  it("uses the OpenAI SDK client-secret API and never returns the server key", async () => {
    const create = vi.fn(async () => ({
      id: "sess_123",
      object: "realtime.session",
      client_secret: { value: "ek_test", expires_at: 123 },
      api_key: "sk-server",
      nested: { apiKey: "sk-server" },
    }));

    const session = await createRealtimeSession({
      apiKey: "sk-server",
      client: { realtime: { clientSecrets: { create } } },
    });

    expect(create).toHaveBeenCalledWith({
      session: {
        type: "realtime",
        model: "gpt-4o-realtime-preview",
        audio: { output: { voice: "alloy" } },
      },
    });
    expect(JSON.stringify(session)).not.toContain("sk-server");
    expect(session.client_secret).toEqual({ value: "ek_test", expires_at: 123 });
  });
});
