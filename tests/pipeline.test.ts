import { describe, expect, it, vi } from "vitest";

import { loadHistory, loadMemory, loadResident } from "../src/lib/data";
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
    const [resident, memory, history] = await Promise.all([loadResident(), loadMemory(), loadHistory()]);

    expect(resident).toEqual({
      name: "Default Resident",
      age: 84,
      room: "A-101",
      timezone: "Asia/Tokyo",
      language: "ja",
    });
    expect(memory).toMatchObject({
      baseline: expect.arrayContaining([expect.stringContaining("walker")]),
      communication_cues: expect.arrayContaining([expect.stringContaining("short, calm sentences")]),
      preferences: expect.arrayContaining([expect.stringContaining("warm tea")]),
      known_triggers: expect.arrayContaining([expect.stringContaining("Corridor noise")]),
      calming_approaches: expect.arrayContaining([expect.stringContaining("Lower voice volume")]),
      family_context_notes: expect.arrayContaining([expect.stringContaining("Daughter")]),
      recent_history: expect.arrayContaining([expect.stringContaining("slower walking")]),
      watch_patterns: expect.arrayContaining([expect.stringContaining("hallway turns")]),
    });
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
    timezone: "Asia/Tokyo",
    language: "ja",
  };
  const memory = {
    baseline: ["Slow walker with front approach preferred."],
    communication_cues: ["Use short, calm sentences."],
    preferences: ["Warm tea after lunch."],
    known_triggers: ["Corridor noise."],
    calming_approaches: ["Lower voice volume."],
    family_context_notes: ["Daughter visits Wednesdays."],
    recent_history: ["Slower walking after lunch."],
    watch_patterns: ["Hallway turn hesitation."],
  };
  const history = [{ note_id: "note-001", date: "2026-07-01", shift: "day", author: "Yamada", text: "History" }];

  it("always assembles Product v1 patient memory fields and full history", () => {
    const input = JSON.parse(buildCompileInput({ note: "New note", resident, memory, history }));

    expect(input.current_note).toBe("New note");
    expect(input.resident_memory.resident).toEqual(resident);
    expect(input.resident_memory.patient_memory).toEqual(memory);
    expect(Object.keys(input.resident_memory.patient_memory).sort()).toEqual([
      "baseline",
      "calming_approaches",
      "communication_cues",
      "family_context_notes",
      "known_triggers",
      "preferences",
      "recent_history",
      "watch_patterns",
    ]);
    expect(input.resident_memory.history).toEqual(history);
    expect(input.resident_memory.instruction).toContain("Patient memory is always included");
    expect(input.resident_memory.instruction).toContain("communication cues");
    expect(input.resident_memory.instruction).toContain("known triggers");
    expect(input.resident_memory.instruction).toContain("calming approaches");
    expect(input.resident_memory.instruction).toContain("family/context notes");
    expect(input.resident_memory.instruction).toContain("watch patterns");
    expect(input.resident_memory.instruction).toContain("missing nursing checks");
    expect(input.output_contract).toContain('note_id to "live"');
  });

  it("requires a server OpenAI key instead of returning local canned output", async () => {
    await expect(compileFromBody({ note: "Local note" }, { hasOpenAIKey: false })).rejects.toThrow("OPENAI_API_KEY is required for compile.");
  });
});

describe("Realtime session route contract", () => {
  it("uses the OpenAI SDK client-secret API and returns only Lane 2 clientSecret shape", async () => {
    const create = vi.fn(async () => ({
      value: "ek_test",
      expires_at: 123,
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
    expect(session).toEqual({ clientSecret: { value: "ek_test", expiresAt: 123 } });
    expect(JSON.stringify(session)).not.toContain("sk-server");
  });

  it("refuses non-ephemeral Realtime secrets", async () => {
    await expect(
      createRealtimeSession({
        apiKey: "sk-server",
        client: {
          realtime: {
            clientSecrets: {
              create: vi.fn(async () => ({ value: "not_ephemeral", expires_at: 123 })),
            },
          },
        },
      }),
    ).rejects.toThrow("ephemeral client secret");
  });

  it("refuses SDK responses that echo the server API key", async () => {
    await expect(
      createRealtimeSession({
        apiKey: "sk-server",
        client: {
          realtime: {
            clientSecrets: {
              create: vi.fn(async () => ({ value: "ek_test", expires_at: 123, apiKey: "sk-server" })),
            },
          },
        },
      }),
    ).rejects.toThrow("server-only credentials");
  });
});
