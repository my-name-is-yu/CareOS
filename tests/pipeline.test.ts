import { afterEach, describe, expect, it, vi } from "vitest";

import { loadHistory, loadMemory, loadMemoryContextForNote, loadResident } from "../src/lib/data";
import { CompileEnvelopeSchema, CompileResultSchema, type CompileResult } from "../src/lib/schema";
import { buildCompileInput, compileFromBody, CompileRequestBodySchema } from "../src/lib/compile";
import { buildGBrainQuery } from "../src/lib/gbrain";
import { lintClinicalLanguage } from "../src/lib/lint";
import { buildRealtimeInstructions, realtimeModel, realtimeWebRtcUrl } from "../src/lib/realtime";
import { normalizeCitationText, verifyCompileResult } from "../src/lib/verify";

const originalCwd = globalThis.process.cwd();
const originalKey = globalThis.process.env.OPENAI_API_KEY;
const originalMemoryBackend = globalThis.process.env.CAREOS_MEMORY_BACKEND;
const originalGBrainCommand = globalThis.process.env.GBRAIN_COMMAND;
const originalGBrainOperation = globalThis.process.env.GBRAIN_OPERATION;
const originalGBrainTimeout = globalThis.process.env.GBRAIN_TIMEOUT_MS;

afterEach(async () => {
  globalThis.process.chdir(originalCwd);
  globalThis.process.env.OPENAI_API_KEY = originalKey;
  globalThis.process.env.CAREOS_MEMORY_BACKEND = originalMemoryBackend;
  globalThis.process.env.GBRAIN_COMMAND = originalGBrainCommand;
  globalThis.process.env.GBRAIN_OPERATION = originalGBrainOperation;
  globalThis.process.env.GBRAIN_TIMEOUT_MS = originalGBrainTimeout;
  vi.restoreAllMocks();
  vi.resetModules();
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
  it("parses the Product v1 CompileResult shape", () => {
    expect(CompileResultSchema.parse(validResult)).toEqual(validResult);
  });

  it("parses the API envelope without alternate compile state", () => {
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

  it("loads resident identity without embedding memory", async () => {
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

  it("includes resident identifiers and current note text in G-Brain search queries", () => {
    expect(
      buildGBrainQuery(
        {
          name: "Aiko Mori",
          age: 84,
          room: "A-101",
          timezone: "Asia/Tokyo",
          language: "ja",
        },
        "Refused medication after corridor noise.",
      ),
    ).toContain("resident Aiko Mori room A-101");
  });

  it("falls back to JSON memory when the G-Brain CLI is unavailable", async () => {
    globalThis.process.env.CAREOS_MEMORY_BACKEND = "gbrain";
    globalThis.process.env.GBRAIN_COMMAND = "careos-missing-gbrain";
    globalThis.process.env.GBRAIN_TIMEOUT_MS = "50";

    await expect(loadMemoryContextForNote("Current note")).resolves.toMatchObject({
      source: "json",
      gbrainContext: null,
      displayMemory: {
        baseline: expect.arrayContaining([expect.stringContaining("walker")]),
        watch_patterns: expect.arrayContaining([expect.stringContaining("medication refusal")]),
      },
    });
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
      "Signs of underlying disease noted.",
      "Symptoms consistent with parkinson's.",
      "Behavior consistent with alzheimer's.",
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
    const assembled = JSON.parse(buildCompileInput({ note: "New note", resident, memory, history, gbrainContext: "G-Brain raw retrieved context" }));
    expect(assembled.current_note).toBe("New note");
    expect(assembled.context.resident).toEqual(resident);
    expect(assembled.context.memory).toEqual(memory);
    expect(assembled.context.gbrain_knowledge_context).toBe("G-Brain raw retrieved context");
    expect(Object.keys(assembled.context.memory).sort()).toEqual([
      "baseline",
      "calming_approaches",
      "communication_cues",
      "family_context_notes",
      "known_triggers",
      "preferences",
      "recent_history",
      "watch_patterns",
    ]);
    expect(assembled.context.history).toEqual(history);
    expect(assembled.context.instruction).toContain("Memory is always on");
    expect(assembled.output_contract).toContain('note_id to "live"');
  });

  it("requires OpenAI for production compile", async () => {
    globalThis.process.env.OPENAI_API_KEY = "";
    await expect(compileFromBody({ note: "Local note" }, { hasOpenAIKey: false })).rejects.toThrow("OPENAI_API_KEY is required.");
  });
});

describe("realtime session route", () => {
  it("uses the current realtime model and WebRTC calls endpoint", () => {
    expect(realtimeModel).toBe("gpt-realtime-2");
    expect(realtimeWebRtcUrl).toBe("https://api.openai.com/v1/realtime/calls");
  });

  it("builds dementia-care instructions with patient memory fields and refusal boundaries", () => {
    const instructions = buildRealtimeInstructions(
      {
        name: "Aiko Mori",
        age: 84,
        room: "A-101",
        timezone: "Asia/Tokyo",
        language: "ja",
      },
      {
        baseline: ["Usually walks slowly with walker support."],
        communication_cues: ["Use short calm prompts."],
        preferences: ["Prefers a quiet room."],
        known_triggers: ["Corridor noise."],
        calming_approaches: ["Close the door and re-approach calmly."],
        family_context_notes: ["Daughter visits on weekends."],
        recent_history: ["Refused evening medication twice this week."],
        watch_patterns: ["Slower gait near hallway turns."],
      },
      [{ note_id: "note-001", date: "2026-07-01", shift: "day", author: "Yamada", text: "Walked slower than baseline." }],
    );

    expect(instructions).toContain("Aiko Mori");
    expect(instructions).toContain("Usually walks slowly with walker support.");
    expect(instructions).toContain("Use short calm prompts.");
    expect(instructions).toContain("Prefers a quiet room.");
    expect(instructions).toContain("Corridor noise.");
    expect(instructions).toContain("Close the door and re-approach calmly.");
    expect(instructions).toContain("Daughter visits on weekends.");
    expect(instructions).toContain("Refused evening medication twice this week.");
    expect(instructions).toContain("Slower gait near hallway turns.");
    expect(instructions).toContain("Refuse diagnosis, prescribing");
    expect(instructions).toContain("Draft concise handoff text");
    expect(instructions).toContain("G-Brain patient knowledge:");
    expect(instructions).not.toContain("Baseline traits");
  });

  it("passes raw G-Brain context through realtime instructions without section extraction", () => {
    const rawContext = "G-Brain says Aiko Mori has repeated evening refusal notes with source citations.";
    const instructions = buildRealtimeInstructions(
      {
        name: "Aiko Mori",
        age: 84,
        room: "A-101",
        timezone: "Asia/Tokyo",
        language: "ja",
      },
      {
        baseline: [],
        communication_cues: [],
        preferences: [],
        known_triggers: [],
        calming_approaches: [],
        family_context_notes: [],
        recent_history: [],
        watch_patterns: [],
      },
      [],
      rawContext,
    );

    expect(instructions).toContain(rawContext);
  });

  it("returns only ephemeral client secret fields and never the server API key", async () => {
    globalThis.process.env.OPENAI_API_KEY = "sk-server-secret";
    const create = vi.fn(async () => ({
      value: "ek_ephemeral_client_secret",
      expires_at: 1234567890,
      type: "realtime",
    }));
    vi.doMock("openai", () => ({
      default: class MockOpenAI {
        realtime = { clientSecrets: { create } };
      },
    }));

    const { POST } = await import("../src/app/api/realtime/session/route");
    const response = await POST();
    const body = await response.json();

    expect(create).toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({
          type: "realtime",
          model: "gpt-realtime-2",
          output_modalities: ["audio"],
          audio: expect.objectContaining({
            input: expect.objectContaining({
              transcription: expect.objectContaining({ model: "gpt-4o-mini-transcribe", language: "ja" }),
              turn_detection: expect.objectContaining({ type: "server_vad", create_response: true, interrupt_response: true }),
            }),
            output: { voice: "marin" },
          }),
        }),
      }),
    );
    expect(body).toEqual({ clientSecret: { value: "ek_ephemeral_client_secret", expiresAt: 1234567890 } });
    expect(body.clientSecret.value).toMatch(/^ek_/);
    expect(JSON.stringify(body)).not.toContain("sk-server-secret");
    expect(JSON.stringify(body)).not.toContain("OPENAI_API_KEY");
  });

  it("refuses non-ephemeral realtime client secret responses", async () => {
    globalThis.process.env.OPENAI_API_KEY = "sk-server-secret";
    vi.doMock("openai", () => ({
      default: class MockOpenAI {
        realtime = {
          clientSecrets: {
            create: vi.fn(async () => ({ value: "sk_server_secret", expires_at: 1234567890 })),
          },
        };
      },
    }));

    const { POST } = await import("../src/app/api/realtime/session/route");
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain("not ephemeral");
    expect(JSON.stringify(body)).not.toContain("sk-server-secret");
  });
});
