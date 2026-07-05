import { afterEach, describe, expect, it, vi } from "vitest";

import { buildGBrainQuery } from "../src/lib/gbrain";
import { lintClinicalLanguage } from "../src/lib/lint";
import { buildRealtimeInstructions, realtimeModel, realtimeWebRtcUrl } from "../src/lib/realtime";
import type { CareRecord, LivingCareProfile } from "../src/lib/schema";
import { normalizeCitationText } from "../src/lib/verify";

const originalKey = globalThis.process.env.OPENAI_API_KEY;

afterEach(() => {
  globalThis.process.env.OPENAI_API_KEY = originalKey;
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("citation text normalization", () => {
  it("normalizes whitespace and quotes", () => {
    expect(normalizeCitationText("  “Walked   SLOWER”  ")).toBe("\"walked slower\"");
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

describe("G-Brain query building", () => {
  it("includes resident identifiers and current note text in search queries", () => {
    expect(
      buildGBrainQuery(
        { id: "aiko-mori", name: "Aiko Mori", age: 84, room: "A-101", timezone: "Asia/Tokyo", language: "ja" },
        "Refused medication after corridor noise.",
      ),
    ).toContain("resident Aiko Mori room A-101");
  });
});

const resident = {
  id: "aiko-mori",
  name: "Aiko Mori",
  age: 84,
  room: "A-101",
  timezone: "Asia/Tokyo",
  language: "ja",
};

const profile: LivingCareProfile = {
  residentId: "aiko-mori",
  version: 3,
  approvedBy: "nurse",
  approvedAt: "2026-07-05T00:00:00.000Z",
  personSummary: { value: "Walks slowly but steadily with a walker.", citations: [], updatedInVersion: 2 },
  recentChanges: {
    value: [{ description: "Slower gait after lunch.", direction: "worsened", citations: [] }],
    citations: [],
    updatedInVersion: 3,
  },
  calmingApproaches: { value: ["Lower room noise and sit at eye level."], citations: [], updatedInVersion: 1 },
  knownTriggers: { value: ["Corridor noise near the room."], citations: [], updatedInVersion: 1 },
  careRecommendations: {
    value: [{ situation: "Evening medication round", approach: "Use a familiar nurse.", citations: [] }],
    citations: [],
    updatedInVersion: 2,
  },
  handoffBrief: { value: "Watch for medication refusal tied to unfamiliar staff.", citations: [], updatedInVersion: 3 },
  trendFlags: {
    value: [{ claim: "Track gait slowness after lunch.", severity: "watch", citations: [] }],
    citations: [],
    updatedInVersion: 1,
  },
};

const recentRecords: CareRecord[] = [
  {
    id: "rec-obs-002",
    residentId: "aiko-mori",
    type: "nurse_observation",
    occurredAt: "2026-07-04T13:00:00.000Z",
    author: { role: "nurse", name: "Yamada" },
    body: "Gait was steady with walker support during the daytime routine.",
  },
];

describe("realtime instructions builder", () => {
  it("uses the current realtime model and WebRTC calls endpoint", () => {
    expect(realtimeModel).toBe("gpt-realtime-2");
    expect(realtimeWebRtcUrl).toBe("https://api.openai.com/v1/realtime/calls");
  });

  it("grounds instructions on the approved Living Care Profile and recent records", () => {
    const instructions = buildRealtimeInstructions({ resident, profile, recentRecords });

    expect(instructions).toContain("Aiko Mori");
    expect(instructions).toContain("Walks slowly but steadily with a walker.");
    expect(instructions).toContain("Lower room noise and sit at eye level.");
    expect(instructions).toContain("Corridor noise near the room.");
    expect(instructions).toContain("Use a familiar nurse.");
    expect(instructions).toContain("Track gait slowness after lunch.");
    expect(instructions).toContain("Watch for medication refusal tied to unfamiliar staff.");
    expect(instructions).toContain("Gait was steady with walker support during the daytime routine.");
    expect(instructions).toContain("Refuse diagnosis, prescribing");
    expect(instructions).toContain("Draft concise handoff text");
    expect(instructions).toContain("Approved Living Care Profile (version 3)");
  });

  it("handles no approved profile without throwing", () => {
    const instructions = buildRealtimeInstructions({ resident, profile: null, recentRecords: [] });
    expect(instructions).toContain("No approved profile loaded yet.");
    expect(instructions).toContain("No recent care records loaded.");
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
    vi.doMock("../src/lib/data", () => ({
      DEFAULT_RESIDENT_ID: "aiko-mori",
      loadResident: async () => resident,
    }));
    vi.doMock("../src/lib/profiles", () => ({
      loadLatestProfile: async () => profile,
    }));
    vi.doMock("../src/lib/records", () => ({
      loadRecords: async () => recentRecords,
    }));

    const { POST } = await import("../src/app/api/realtime/session/route");
    const request = new Request("http://localhost/api/realtime/session", { method: "POST" });
    const response = await POST(request as never);
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
    vi.doMock("../src/lib/data", () => ({
      DEFAULT_RESIDENT_ID: "aiko-mori",
      loadResident: async () => resident,
    }));
    vi.doMock("../src/lib/profiles", () => ({
      loadLatestProfile: async () => profile,
    }));
    vi.doMock("../src/lib/records", () => ({
      loadRecords: async () => recentRecords,
    }));

    const { POST } = await import("../src/app/api/realtime/session/route");
    const request = new Request("http://localhost/api/realtime/session", { method: "POST" });
    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain("not ephemeral");
    expect(JSON.stringify(body)).not.toContain("sk-server-secret");
  });
});
