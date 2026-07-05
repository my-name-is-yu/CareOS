import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lintClinicalLanguage } from "../src/lib/lint";
import { loadLatestProfile, loadProfile, loadProposals, saveProfileVersion } from "../src/lib/profiles";
import { appendRecord } from "../src/lib/records";
import type { CareRecord, FieldDiff, LivingCareProfile } from "../src/lib/schema";
import { normalizeCitationText, verifyProposalChanges } from "../src/lib/verify";

const originalDataDir = globalThis.process.env.CAREOS_DATA_DIR;
const originalBackend = globalThis.process.env.CAREOS_MEMORY_BACKEND;
const originalGbrainCommand = globalThis.process.env.GBRAIN_COMMAND;
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
  tempDir = await mkdtemp(path.join(os.tmpdir(), "careos-safety-"));
  globalThis.process.env.CAREOS_DATA_DIR = tempDir;
});

afterEach(async () => {
  globalThis.process.env.CAREOS_DATA_DIR = originalDataDir;
  globalThis.process.env.CAREOS_MEMORY_BACKEND = originalBackend;
  globalThis.process.env.GBRAIN_COMMAND = originalGbrainCommand;
  await rm(tempDir, { recursive: true, force: true });
  // syncRecordToGBrain() intentionally writes into the real project cwd's
  // brain/residents/records/ (not the CAREOS_DATA_DIR override) so GBrain's
  // own CLI can import it; clean up that side effect after each test run.
  await rm(path.join(globalThis.process.cwd(), "brain", "residents", "records"), { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.resetModules();
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

async function profileFilesFor(residentId: string): Promise<string[]> {
  try {
    return await readdir(path.join(tempDir, "profiles", residentId));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 1. The profile never changes without nurse approval.
// ---------------------------------------------------------------------------
describe("safety contract: profile never changes without nurse approval", () => {
  it("generateProposal does not create a new profile file and does not alter v1.json", async () => {
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

    const filesBefore = await profileFilesFor(RESIDENT_ID);
    const v1Before = await readFile(path.join(tempDir, "profiles", RESIDENT_ID, "v1.json"), "utf8");

    const { generateProposal } = await import("../src/lib/proposal");
    const envelope = await generateProposal({ hasOpenAIKey: true });

    expect(envelope.proposal).not.toBeNull();

    const filesAfter = await profileFilesFor(RESIDENT_ID);
    expect(filesAfter).toEqual(filesBefore);
    expect(filesAfter).toEqual(["v1.json"]);

    const v1After = await readFile(path.join(tempDir, "profiles", RESIDENT_ID, "v1.json"), "utf8");
    expect(v1After).toEqual(v1Before);

    const profileAfter = await loadProfile(RESIDENT_ID, 1);
    expect(profileAfter).toEqual(baseProfile);
  });

  it("only the approve route creates version 2", async () => {
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
    expect(envelope.proposal).not.toBeNull();

    expect(await profileFilesFor(RESIDENT_ID)).toEqual(["v1.json"]);

    const { POST } = await import("../src/app/api/proposals/[id]/approve/route");
    const request = new Request(`http://localhost/api/proposals/${envelope.proposal!.id}/approve`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(request as never, { params: Promise.resolve({ id: envelope.proposal!.id }) });
    expect(response.status).toBe(200);

    const filesAfterApprove = await profileFilesFor(RESIDENT_ID);
    expect(filesAfterApprove.sort()).toEqual(["v1.json", "v2.json"]);

    const latest = await loadLatestProfile(RESIDENT_ID);
    expect(latest?.version).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2. Rejecting a proposal never alters any profile file.
// ---------------------------------------------------------------------------
describe("safety contract: rejecting a proposal never alters any profile file", () => {
  it("leaves the profile file untouched after reject", async () => {
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
    expect(envelope.proposal).not.toBeNull();

    const v1Before = await readFile(path.join(tempDir, "profiles", RESIDENT_ID, "v1.json"), "utf8");

    const { POST } = await import("../src/app/api/proposals/[id]/reject/route");
    const response = await POST({} as never, { params: Promise.resolve({ id: envelope.proposal!.id }) });
    expect(response.status).toBe(200);

    const filesAfter = await profileFilesFor(RESIDENT_ID);
    expect(filesAfter).toEqual(["v1.json"]);
    const v1After = await readFile(path.join(tempDir, "profiles", RESIDENT_ID, "v1.json"), "utf8");
    expect(v1After).toEqual(v1Before);

    const [storedProposal] = await loadProposals(RESIDENT_ID);
    expect(storedProposal.status).toBe("rejected");
  });
});

// ---------------------------------------------------------------------------
// 3. A proposal whose citations are all fabricated ends as proposal:null and
//    nothing is persisted to proposals.json.
// ---------------------------------------------------------------------------
describe("safety contract: fully fabricated citations never persist", () => {
  it("returns proposal:null after a corrective rerun and stores nothing", async () => {
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
    expect(envelope.proposal).toBeNull();
    expect(envelope.verified).toBe(false);

    const stored = await loadProposals(RESIDENT_ID);
    expect(stored).toHaveLength(0);

    const proposalsFileExists = await readFile(path.join(tempDir, "proposals.json"), "utf8").catch(() => null);
    if (proposalsFileExists !== null) {
      expect(JSON.parse(proposalsFileExists)).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Verbatim-citation guarantee: every citation surviving verification has
//    its quote found (normalized) in the cited record body.
// ---------------------------------------------------------------------------
describe("safety contract: verbatim citation guarantee", () => {
  const records: CareRecord[] = [
    oldRecord,
    newRecord,
    {
      id: "rec-family-001",
      residentId: RESIDENT_ID,
      type: "family_memory",
      occurredAt: "2026-06-21T15:00:00.000Z",
      author: { role: "family", name: "Mika Mori" },
      body: "My mother has always loved quiet music after dinner - it used to help her wind down.",
    },
    {
      id: "rec-incident-001",
      residentId: RESIDENT_ID,
      type: "incident_report",
      occurredAt: "2026-06-24T19:30:00.000Z",
      author: { role: "nurse", name: "Yamada" },
      body: 'Evening agitation observed; resident said "I feel calm when the room is quiet."',
    },
  ];

  const bodyByRecordId = new Map(records.map((record) => [record.id, record.body]));

  // A property-style fixture set mixing verbatim, near-miss (whitespace/case/
  // curly-quote variants that should still match after normalization), and
  // fully fabricated quotes.
  const fixtureChanges: FieldDiff[] = [
    {
      field: "calmingApproaches",
      before: [],
      after: ["Dim the lights and lower noise in the evening."],
      citations: [{ recordId: "rec-obs-002", quote: "  DIMMED   the lights and lowered noise  " }],
      rationale: "Case/whitespace-insensitive verbatim match.",
    },
    {
      field: "knownTriggers",
      before: [],
      after: ["Loud environment at night."],
      citations: [{ recordId: "rec-obs-002", quote: "this quote is entirely fabricated" }],
      rationale: "Fabricated citation must be dropped.",
    },
    {
      field: "recentChanges",
      before: [],
      after: [
        {
          description: "Music helps her wind down.",
          direction: "new",
          citations: [{ recordId: "rec-family-001", quote: "quiet music after dinner" }],
        },
        {
          description: "Fabricated recent change.",
          direction: "new",
          citations: [{ recordId: "rec-family-001", quote: "not present anywhere in this body" }],
        },
      ],
      citations: [{ recordId: "rec-family-001", quote: "quiet music after dinner" }],
      rationale: "Mixed structured-field citations.",
    },
    {
      field: "trendFlags",
      before: [],
      after: [
        {
          claim: "Watch for evening agitation.",
          severity: "watch",
          citations: [{ recordId: "rec-incident-001", quote: "“I feel calm when the room is quiet.”" }],
        },
      ],
      citations: [{ recordId: "rec-incident-001", quote: "I feel calm when the room is quiet." }],
      rationale: "Curly-quote variant of a straight-quote source must still verify.",
    },
  ];

  it("every citation surviving verification is found verbatim (normalized) in its cited record body", () => {
    const result = verifyProposalChanges(fixtureChanges, records);

    function assertCitationsAreGrounded(citations: { recordId: string; quote: string }[]) {
      for (const citation of citations) {
        const body = bodyByRecordId.get(citation.recordId);
        expect(body).toBeDefined();
        expect(normalizeCitationText(body!)).toContain(normalizeCitationText(citation.quote));
      }
    }

    expect(result.changes.length).toBeGreaterThan(0);
    for (const change of result.changes) {
      assertCitationsAreGrounded(change.citations);
      if (Array.isArray(change.after)) {
        for (const item of change.after as Array<{ citations?: { recordId: string; quote: string }[] }>) {
          if (item.citations) assertCitationsAreGrounded(item.citations);
        }
      }
    }

    // The fabricated top-level trigger citation must have been dropped entirely.
    expect(result.changes.some((change) => change.field === "knownTriggers")).toBe(false);
    // The fabricated recentChanges item must have been dropped but the supported one kept.
    const recentChanges = result.changes.find((change) => change.field === "recentChanges");
    expect(recentChanges?.after).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 5. Unsafe clinical language in mocked model output produces lint warnings
//    in the envelope; warnings are surfaced, not silently dropped.
// ---------------------------------------------------------------------------
describe("safety contract: unsafe clinical language surfaces as warnings", () => {
  it("generateProposal returns non-empty warnings when the model proposes clinical language, and still verifies/saves the change", async () => {
    await appendRecord(oldRecord);
    await appendRecord(newRecord);
    await saveProfileVersion(baseProfile);

    const parse = vi.fn().mockResolvedValue(
      parsedResponse([
        {
          field: "handoffBrief",
          after: JSON.stringify("Consider a diagnosis of vascular issues based on the quiet room comment."),
          citations: [{ recordId: "rec-obs-002", quote: "I feel calm when the room is quiet" }],
          rationale: "Unsafe clinical language should be flagged, not silently dropped.",
        },
      ]),
    );
    mockOpenAiParse(parse);

    const { generateProposal } = await import("../src/lib/proposal");
    const envelope = await generateProposal({ hasOpenAIKey: true });

    expect(envelope.warnings).toContain("Review language for clinical, diagnostic, or prescribing claims.");
    // The lint is a warning surfaced to the nurse, not a mechanism that blocks
    // or silently strips the change -- verify current behavior explicitly.
    expect(envelope.proposal).not.toBeNull();
    expect(envelope.proposal?.changes[0]?.field).toBe("handoffBrief");
  });

  it("lintClinicalLanguage warns directly on unsafe phrases used across the pipeline", () => {
    expect(lintClinicalLanguage({ summary: "Prescribing a new plan for the resident." })).toEqual([
      "Review language for clinical, diagnostic, or prescribing claims.",
    ]);
    expect(lintClinicalLanguage({ summary: "Resident had a calm afternoon." })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6. GBrain fallback.
// ---------------------------------------------------------------------------
describe("safety contract: GBrain fallback", () => {
  it("with CAREOS_MEMORY_BACKEND unset, appendRecord + syncRecordToGBrain and generateProposal work with no gbrain binary present", async () => {
    delete globalThis.process.env.CAREOS_MEMORY_BACKEND;

    await appendRecord(oldRecord);
    await appendRecord(newRecord);
    await saveProfileVersion(baseProfile);

    const { syncRecordToGBrain } = await import("../src/lib/gbrain");
    await expect(syncRecordToGBrain(newRecord)).resolves.toBeUndefined();

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
    expect(envelope.proposal).not.toBeNull();
  });

  it("with CAREOS_MEMORY_BACKEND=gbrain and a nonexistent GBRAIN_COMMAND, syncRecordToGBrain swallows the failure and generateProposal still succeeds with gbrainContext null", async () => {
    globalThis.process.env.CAREOS_MEMORY_BACKEND = "gbrain";
    globalThis.process.env.GBRAIN_COMMAND = "definitely-not-a-real-gbrain-binary";

    await appendRecord(oldRecord);
    await appendRecord(newRecord);
    await saveProfileVersion(baseProfile);

    const { syncRecordToGBrain } = await import("../src/lib/gbrain");
    await expect(syncRecordToGBrain(newRecord)).resolves.toBeUndefined();

    let capturedGbrainContext: unknown = "unset";
    const parse = vi.fn().mockImplementation(async (args: { messages: Array<{ role: string; content: string }> }) => {
      const userMessage = args.messages.find((message) => message.role === "user");
      capturedGbrainContext = JSON.parse(userMessage?.content ?? "{}").gbrain_knowledge_context;
      return parsedResponse([
        {
          field: "calmingApproaches",
          after: JSON.stringify(["Dim the lights and lower noise in the evening."]),
          citations: [{ recordId: "rec-obs-002", quote: "dimmed the lights and lowered noise" }],
          rationale: "New record shows a calming approach that works.",
        },
      ]);
    });
    mockOpenAiParse(parse);

    const { generateProposal } = await import("../src/lib/proposal");
    const envelope = await generateProposal({ hasOpenAIKey: true });

    expect(envelope.proposal).not.toBeNull();
    expect(capturedGbrainContext).toBeNull();
  });
});
