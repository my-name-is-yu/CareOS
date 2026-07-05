import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyProposalToProfile, assertProposalIsCurrent, StaleProposalError } from "../src/lib/approve";
import { loadLatestProfile, loadProposals, saveProfileVersion, saveProposal, updateProposalStatus } from "../src/lib/profiles";
import type { FieldDiff, LivingCareProfile, ProfileUpdateProposal } from "../src/lib/schema";

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

const baseProposal: ProfileUpdateProposal = {
  id: "prop-001",
  residentId: RESIDENT_ID,
  baseVersion: 1,
  triggeredBy: ["rec-obs-001"],
  createdAt: "2026-07-05T00:00:00Z",
  changes: [
    {
      field: "handoffBrief",
      before: "Handoff text.",
      after: "Updated handoff text with new evidence.",
      citations: [{ recordId: "rec-obs-002", quote: "Updated handoff evidence." }],
      rationale: "New record changed the handoff brief.",
    },
  ],
  status: "proposed",
};

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "careos-approve-"));
  globalThis.process.env.CAREOS_DATA_DIR = tempDir;
});

afterEach(async () => {
  globalThis.process.env.CAREOS_DATA_DIR = originalDataDir;
  await rm(tempDir, { recursive: true, force: true });
});

describe("applyProposalToProfile", () => {
  it("applies changed fields, bumps the version, and carries over untouched fields", () => {
    const changes: FieldDiff[] = [
      {
        field: "handoffBrief",
        before: "Handoff text.",
        after: "Updated handoff text with new evidence.",
        citations: [{ recordId: "rec-obs-002", quote: "Updated handoff evidence." }],
        rationale: "New record changed the handoff brief.",
      },
      {
        field: "knownTriggers",
        before: ["Corridor noise."],
        after: ["Corridor noise.", "Bright lights at night."],
        citations: [{ recordId: "rec-obs-003", quote: "Bright lights at night." }],
        rationale: "New trigger observed.",
      },
    ];

    const next = applyProposalToProfile(baseProfile, changes, "nurse-tanaka", "2026-07-06T00:00:00.000Z");

    expect(next.version).toBe(2);
    expect(next.approvedBy).toBe("nurse-tanaka");
    expect(next.approvedAt).toBe("2026-07-06T00:00:00.000Z");

    expect(next.handoffBrief).toEqual({
      value: "Updated handoff text with new evidence.",
      citations: [{ recordId: "rec-obs-002", quote: "Updated handoff evidence." }],
      updatedInVersion: 2,
    });
    expect(next.knownTriggers).toEqual({
      value: ["Corridor noise.", "Bright lights at night."],
      citations: [{ recordId: "rec-obs-003", quote: "Bright lights at night." }],
      updatedInVersion: 2,
    });

    // Untouched fields carry over unchanged, including their original updatedInVersion.
    expect(next.personSummary).toEqual(baseProfile.personSummary);
    expect(next.calmingApproaches).toEqual(baseProfile.calmingApproaches);
    expect(next.careRecommendations).toEqual(baseProfile.careRecommendations);
    expect(next.trendFlags).toEqual(baseProfile.trendFlags);
    expect(next.recentChanges).toEqual(baseProfile.recentChanges);
  });
});

describe("assertProposalIsCurrent", () => {
  it("passes when the proposal base version matches the latest profile version", () => {
    expect(() => assertProposalIsCurrent(1, baseProfile)).not.toThrow();
  });

  it("throws StaleProposalError when the proposal is stale", () => {
    const newerProfile = { ...baseProfile, version: 2 };
    expect(() => assertProposalIsCurrent(1, newerProfile)).toThrow(StaleProposalError);
  });
});

describe("approve/reject route logic", () => {
  it("approve applies the proposal, saves a new profile version, and marks the proposal approved", async () => {
    await saveProfileVersion(baseProfile);
    await saveProposal(baseProposal);

    const { POST } = await import("../src/app/api/proposals/[id]/approve/route");
    const request = new Request("http://localhost/api/proposals/prop-001/approve", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(request as never, { params: Promise.resolve({ id: "prop-001" }) });
    const body = (await response.json()) as { profile: LivingCareProfile; proposal: ProfileUpdateProposal };

    expect(response.status).toBe(200);
    expect(body.profile.version).toBe(2);
    expect(body.profile.approvedBy).toBe("nurse");
    expect(body.profile.handoffBrief.value).toBe("Updated handoff text with new evidence.");
    expect(body.proposal.status).toBe("approved");

    expect(await loadLatestProfile(RESIDENT_ID)).toEqual(body.profile);
    const [storedProposal] = await loadProposals(RESIDENT_ID);
    expect(storedProposal.status).toBe("approved");
  });

  it("reject marks the proposal rejected and leaves the profile untouched", async () => {
    await saveProfileVersion(baseProfile);
    await saveProposal(baseProposal);

    const { POST } = await import("../src/app/api/proposals/[id]/reject/route");
    const response = await POST({} as never, { params: Promise.resolve({ id: "prop-001" }) });
    const body = (await response.json()) as { proposal: ProfileUpdateProposal };

    expect(response.status).toBe(200);
    expect(body.proposal.status).toBe("rejected");

    const profileAfter = await loadLatestProfile(RESIDENT_ID);
    expect(profileAfter).toEqual(baseProfile);
  });

  it("approve fails with 409 for a stale proposal (baseVersion behind the latest profile)", async () => {
    await saveProfileVersion(baseProfile);
    await saveProposal(baseProposal);
    // A second profile version lands after the proposal was generated against v1.
    await saveProfileVersion({ ...baseProfile, version: 2, handoffBrief: { ...baseProfile.handoffBrief, value: "Someone else updated this." } });

    const { POST } = await import("../src/app/api/proposals/[id]/approve/route");
    const request = new Request("http://localhost/api/proposals/prop-001/approve", { method: "POST", body: JSON.stringify({}) });
    const response = await POST(request as never, { params: Promise.resolve({ id: "prop-001" }) });

    expect(response.status).toBe(409);
    const profileAfter = await loadLatestProfile(RESIDENT_ID);
    expect(profileAfter?.version).toBe(2);
  });

  it("approve fails with 404 for an unknown proposal id", async () => {
    await saveProfileVersion(baseProfile);

    const { POST } = await import("../src/app/api/proposals/[id]/approve/route");
    const request = new Request("http://localhost/api/proposals/missing/approve", { method: "POST", body: JSON.stringify({}) });
    const response = await POST(request as never, { params: Promise.resolve({ id: "missing" }) });

    expect(response.status).toBe(404);
  });

  it("approve fails with 409 when the proposal is already resolved", async () => {
    await saveProfileVersion(baseProfile);
    await saveProposal(baseProposal);
    await updateProposalStatus("prop-001", "rejected");

    const { POST } = await import("../src/app/api/proposals/[id]/approve/route");
    const request = new Request("http://localhost/api/proposals/prop-001/approve", { method: "POST", body: JSON.stringify({}) });
    const response = await POST(request as never, { params: Promise.resolve({ id: "prop-001" }) });

    expect(response.status).toBe(409);
    const profileAfter = await loadLatestProfile(RESIDENT_ID);
    expect(profileAfter).toEqual(baseProfile);
  });

  it("approve applies editedChanges instead of the original proposal changes and marks edited_and_approved", async () => {
    await saveProfileVersion(baseProfile);
    await saveProposal(baseProposal);

    const editedChanges: FieldDiff[] = [
      {
        field: "handoffBrief",
        before: "Handoff text.",
        after: "Nurse-edited handoff text.",
        citations: [{ recordId: "rec-obs-002", quote: "Updated handoff evidence." }],
        rationale: "Edited by reviewing nurse before approval.",
      },
    ];

    const { POST } = await import("../src/app/api/proposals/[id]/approve/route");
    const request = new Request("http://localhost/api/proposals/prop-001/approve", {
      method: "POST",
      body: JSON.stringify({ approvedBy: "nurse-yamada", editedChanges }),
    });
    const response = await POST(request as never, { params: Promise.resolve({ id: "prop-001" }) });
    const body = (await response.json()) as { profile: LivingCareProfile; proposal: ProfileUpdateProposal };

    expect(response.status).toBe(200);
    expect(body.profile.handoffBrief.value).toBe("Nurse-edited handoff text.");
    expect(body.profile.approvedBy).toBe("nurse-yamada");
    expect(body.proposal.status).toBe("edited_and_approved");
  });

  it("approve applies editedChanges that remove an item from a structured list field", async () => {
    await saveProfileVersion(baseProfile);
    const structuredProposal: ProfileUpdateProposal = {
      ...baseProposal,
      changes: [
        {
          field: "careRecommendations",
          before: [],
          after: [
            {
              situation: "Resident is agitated before meals.",
              approach: "Offer a calm walk beforehand.",
              citations: [{ recordId: "rec-obs-004", quote: "Agitated before lunch." }],
            },
            {
              situation: "Resident resists bathing.",
              approach: "Use warm towels first.",
              citations: [{ recordId: "rec-obs-005", quote: "Resisted bathing this morning." }],
            },
          ],
          citations: [{ recordId: "rec-obs-004", quote: "Agitated before lunch." }],
          rationale: "New observations suggest additional care recommendations.",
        },
      ],
    };
    await saveProposal(structuredProposal);

    const editedChanges: FieldDiff[] = [
      {
        field: "careRecommendations",
        before: [],
        after: [
          {
            situation: "Resident is agitated before meals.",
            approach: "Offer a calm walk beforehand.",
            citations: [{ recordId: "rec-obs-004", quote: "Agitated before lunch." }],
          },
        ],
        citations: [{ recordId: "rec-obs-004", quote: "Agitated before lunch." }],
        rationale: "New observations suggest additional care recommendations.",
      },
    ];

    const { POST } = await import("../src/app/api/proposals/[id]/approve/route");
    const request = new Request("http://localhost/api/proposals/prop-001/approve", {
      method: "POST",
      body: JSON.stringify({ approvedBy: "nurse-yamada", editedChanges }),
    });
    const response = await POST(request as never, { params: Promise.resolve({ id: "prop-001" }) });
    const body = (await response.json()) as { profile: LivingCareProfile; proposal: ProfileUpdateProposal };

    expect(response.status).toBe(200);
    expect(body.profile.careRecommendations.value).toEqual([
      {
        situation: "Resident is agitated before meals.",
        approach: "Offer a calm walk beforehand.",
        citations: [{ recordId: "rec-obs-004", quote: "Agitated before lunch." }],
      },
    ]);
    expect(body.proposal.status).toBe("edited_and_approved");
  });
});
