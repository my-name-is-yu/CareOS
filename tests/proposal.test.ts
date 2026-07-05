import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseFieldValue } from "../src/lib/profile-agent";
import { loadProfile, loadProposals, saveProfileVersion } from "../src/lib/profiles";
import { appendRecord } from "../src/lib/records";
import type { CareRecord, FieldDiff, LivingCareProfile } from "../src/lib/schema";
import { needsCorrectiveProposalRerun, verifyProposalChanges } from "../src/lib/verify";

const originalDataDir = globalThis.process.env.CAREOS_DATA_DIR;
let tempDir: string;

const RESIDENT_ID = "aiko-mori";

const baseProfile: LivingCareProfile = {
  residentId: RESIDENT_ID,
  version: 1,
  approvedBy: "seed-migration",
  approvedAt: "2026-07-05T00:00:00Z",
  personSummary: { value: "Summary text.", citations: [], updatedInVersion: 1 },
  recentChanges: { value: [], citations: [], updatedInVersion: 1 },
  calmingApproaches: { value: ["Lower room noise."], citations: [], updatedInVersion: 1 },
  knownTriggers: { value: ["Corridor noise."], citations: [], updatedInVersion: 1 },
  careRecommendations: { value: [], citations: [], updatedInVersion: 1 },
  handoffBrief: { value: "Handoff text.", citations: [], updatedInVersion: 1 },
  trendFlags: { value: [], citations: [], updatedInVersion: 1 },
};

const oldRecord: CareRecord = {
  id: "rec-obs-001",
  residentId: RESIDENT_ID,
  type: "nurse_observation",
  occurredAt: "2026-07-01T12:00:00.000Z",
  author: { role: "nurse", name: "Yamada" },
  body: "Resident rested comfortably after lunch.",
};

const newRecord: CareRecord = {
  id: "rec-obs-002",
  residentId: RESIDENT_ID,
  type: "nurse_observation",
  occurredAt: "2026-07-06T10:00:00.000Z",
  author: { role: "nurse", name: "Tanaka" },
  body: "Resident said, 'I feel calm when the room is quiet,' after staff dimmed the lights and lowered noise.",
};

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "careos-proposal-"));
  globalThis.process.env.CAREOS_DATA_DIR = tempDir;
});

afterEach(async () => {
  globalThis.process.env.CAREOS_DATA_DIR = originalDataDir;
  await rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("verifyProposalChanges", () => {
  const records = [oldRecord, newRecord];

  it("drops fabricated citations and keeps verbatim ones for simple fields", () => {
    const changes: FieldDiff[] = [
      {
        field: "calmingApproaches",
        before: ["Lower room noise."],
        after: ["Dim the lights and lower noise in the evening."],
        citations: [{ recordId: "rec-obs-002", quote: "dimmed the lights and lowered noise" }],
        rationale: "New record shows a calming approach.",
      },
      {
        field: "knownTriggers",
        before: ["Corridor noise."],
        after: ["Bright lights at night."],
        citations: [{ recordId: "rec-obs-002", quote: "this quote does not appear anywhere" }],
        rationale: "Fabricated trigger.",
      },
    ];

    const result = verifyProposalChanges(changes, records);

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.field).toBe("calmingApproaches");
    expect(result.droppedChanges).toBe(1);
    expect(result.droppedCitations).toBe(1);
  });

  it("drops unsupported items within structured field values but keeps supported ones", () => {
    const changes: FieldDiff[] = [
      {
        field: "recentChanges",
        before: [],
        after: [
          {
            description: "Resident reports feeling calm in a quiet room.",
            direction: "new",
            citations: [{ recordId: "rec-obs-002", quote: "I feel calm when the room is quiet" }],
          },
          {
            description: "Fabricated change with no support.",
            direction: "new",
            citations: [{ recordId: "rec-obs-002", quote: "totally made up text" }],
          },
        ],
        citations: [{ recordId: "rec-obs-002", quote: "I feel calm when the room is quiet" }],
        rationale: "New record shows a recent change.",
      },
    ];

    const result = verifyProposalChanges(changes, records);

    expect(result.changes).toHaveLength(1);
    const after = result.changes[0]?.after as Array<{ description: string }>;
    expect(after).toHaveLength(1);
    expect(after[0]?.description).toBe("Resident reports feeling calm in a quiet room.");
    expect(result.droppedCitations).toBeGreaterThan(0);
  });

  it("drops a structured change entirely when every item is unsupported", () => {
    const changes: FieldDiff[] = [
      {
        field: "trendFlags",
        before: [],
        after: [
          {
            claim: "Fabricated trend.",
            severity: "watch",
            citations: [{ recordId: "rec-obs-002", quote: "not a real quote" }],
          },
        ],
        citations: [{ recordId: "rec-obs-002", quote: "I feel calm when the room is quiet" }],
        rationale: "Trend claim.",
      },
    ];

    const result = verifyProposalChanges(changes, records);

    expect(result.changes).toHaveLength(0);
    expect(result.droppedChanges).toBe(1);
  });

  it("flags rerun as needed only when everything was dropped", () => {
    expect(needsCorrectiveProposalRerun({ changes: [], droppedChanges: 1, droppedCitations: 1 })).toBe(true);
    expect(needsCorrectiveProposalRerun({ changes: [{} as FieldDiff], droppedChanges: 1, droppedCitations: 1 })).toBe(false);
    expect(needsCorrectiveProposalRerun({ changes: [], droppedChanges: 0, droppedCitations: 0 })).toBe(false);
  });
});

describe("parseFieldValue", () => {
  it("accepts values matching each field's expected shape", () => {
    expect(parseFieldValue("personSummary", JSON.stringify("A summary."))).toBe("A summary.");
    expect(parseFieldValue("handoffBrief", JSON.stringify("Brief."))).toBe("Brief.");
    expect(parseFieldValue("calmingApproaches", JSON.stringify(["Play music."]))).toEqual(["Play music."]);
    expect(parseFieldValue("knownTriggers", JSON.stringify(["Loud noise."]))).toEqual(["Loud noise."]);
    expect(
      parseFieldValue(
        "recentChanges",
        JSON.stringify([{ description: "Change.", direction: "new", citations: [] }]),
      ),
    ).toEqual([{ description: "Change.", direction: "new", citations: [] }]);
    expect(
      parseFieldValue(
        "careRecommendations",
        JSON.stringify([{ situation: "Sit.", approach: "Do this.", citations: [] }]),
      ),
    ).toEqual([{ situation: "Sit.", approach: "Do this.", citations: [] }]);
    expect(
      parseFieldValue("trendFlags", JSON.stringify([{ claim: "Watch this.", severity: "watch", citations: [] }])),
    ).toEqual([{ claim: "Watch this.", severity: "watch", citations: [] }]);
  });

  it("rejects malformed JSON", () => {
    expect(() => parseFieldValue("personSummary", "{not json")).toThrow(/not valid JSON/);
  });

  it("rejects values with the wrong shape", () => {
    expect(() => parseFieldValue("personSummary", JSON.stringify(["not", "a", "string"]))).toThrow(/expected shape/);
    expect(() => parseFieldValue("calmingApproaches", JSON.stringify("not an array"))).toThrow(/expected shape/);
    expect(() => parseFieldValue("recentChanges", JSON.stringify([{ description: "Missing direction." }]))).toThrow(
      /expected shape/,
    );
    expect(() => parseFieldValue("trendFlags", JSON.stringify([{ claim: "x", severity: "bogus", citations: [] }]))).toThrow(
      /expected shape/,
    );
  });
});

function mockOpenAiParse(parse: ReturnType<typeof vi.fn>) {
  vi.doMock("openai", () => ({
    default: class MockOpenAI {
      chat = { completions: { parse } };
    },
  }));
}

function parsedResponse(changes: unknown[]) {
  return { choices: [{ message: { parsed: { changes } } }] };
}

describe("generateProposal", () => {
  it("throws a clear error when there are no new records", async () => {
    await appendRecord(oldRecord);
    await saveProfileVersion(baseProfile);

    const { generateProposal } = await import("../src/lib/proposal");

    await expect(generateProposal({ hasOpenAIKey: true })).rejects.toThrow(
      "No new care records to generate a proposal from.",
    );
  });

  it("saves a verified proposal end-to-end with before filled from the current profile", async () => {
    await appendRecord(oldRecord);
    await appendRecord(newRecord);
    await saveProfileVersion(baseProfile);

    const parse = vi.fn().mockResolvedValue(
      parsedResponse([
        {
          field: "calmingApproaches",
          after: JSON.stringify(["Dim the lights and lower noise in the evening."]),
          citations: [{ recordId: "rec-obs-002", quote: "dimmed the lights and lowered noise" }],
          rationale: "New record shows a calming approach that works.",
        },
      ]),
    );
    mockOpenAiParse(parse);

    const { generateProposal } = await import("../src/lib/proposal");
    const envelope = await generateProposal({ hasOpenAIKey: true });

    expect(parse).toHaveBeenCalledTimes(1);
    expect(envelope.proposal).not.toBeNull();
    expect(envelope.verified).toBe(true);
    expect(envelope.proposal?.status).toBe("proposed");
    expect(envelope.proposal?.baseVersion).toBe(1);
    expect(envelope.proposal?.residentId).toBe(RESIDENT_ID);
    expect(envelope.proposal?.triggeredBy).toEqual(["rec-obs-002"]);
    expect(envelope.proposal?.changes).toHaveLength(1);
    expect(envelope.proposal?.changes[0]?.before).toEqual(["Lower room noise."]);
    expect(envelope.proposal?.changes[0]?.after).toEqual(["Dim the lights and lower noise in the evening."]);

    const stored = await loadProposals(RESIDENT_ID);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe(envelope.proposal?.id);
    expect(stored[0]?.status).toBe("proposed");

    const profileAfter = await loadProfile(RESIDENT_ID, 1);
    expect(profileAfter).toEqual(baseProfile);
  });

  it("reruns once with a corrective instruction and returns proposal null when still unsupported", async () => {
    await appendRecord(oldRecord);
    await appendRecord(newRecord);
    await saveProfileVersion(baseProfile);

    const fabricated = () =>
      parsedResponse([
        {
          field: "calmingApproaches",
          after: JSON.stringify(["Fabricated approach."]),
          citations: [{ recordId: "rec-obs-002", quote: "this text does not exist in the record" }],
          rationale: "Unsupported.",
        },
      ]);

    const parse = vi.fn().mockResolvedValueOnce(fabricated()).mockResolvedValueOnce(fabricated());
    mockOpenAiParse(parse);

    const { generateProposal } = await import("../src/lib/proposal");
    const envelope = await generateProposal({ hasOpenAIKey: true });

    expect(parse).toHaveBeenCalledTimes(2);
    const secondCallMessages = parse.mock.calls[1]?.[0]?.messages as Array<{ role: string; content: string }>;
    const userMessage = secondCallMessages.find((message) => message.role === "user");
    expect(userMessage?.content).toContain("unsupported or fabricated citations");

    expect(envelope.proposal).toBeNull();
    expect(envelope.verified).toBe(false);

    const stored = await loadProposals(RESIDENT_ID);
    expect(stored).toHaveLength(0);

    const profileAfter = await loadProfile(RESIDENT_ID, 1);
    expect(profileAfter).toEqual(baseProfile);
  });
});
