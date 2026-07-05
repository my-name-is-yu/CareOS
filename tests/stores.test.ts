import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appendRecord, loadRecords, nextRecordId } from "../src/lib/records";
import { loadLatestProfile, loadProfile, loadProposals, saveProfileVersion, saveProposal, updateProposalStatus } from "../src/lib/profiles";
import { CareRecordSchema, type CareRecord, type LivingCareProfile, type ProfileUpdateProposal } from "../src/lib/schema";

const originalDataDir = globalThis.process.env.CAREOS_DATA_DIR;
let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "careos-stores-"));
  globalThis.process.env.CAREOS_DATA_DIR = tempDir;
});

afterEach(async () => {
  globalThis.process.env.CAREOS_DATA_DIR = originalDataDir;
  await rm(tempDir, { recursive: true, force: true });
});

const baseRecord: CareRecord = {
  id: "rec-obs-001",
  residentId: "aiko-mori",
  type: "nurse_observation",
  occurredAt: "2026-07-01T12:00:00.000Z",
  author: { role: "nurse", name: "Yamada" },
  body: "Resident rested comfortably after lunch.",
};

describe("CareRecordSchema", () => {
  it("accepts a well-formed care record", () => {
    expect(CareRecordSchema.parse(baseRecord)).toEqual(baseRecord);
  });

  it("rejects a record missing required fields", () => {
    expect(() => CareRecordSchema.parse({ ...baseRecord, body: "" })).toThrow();
    expect(() => CareRecordSchema.parse({ ...baseRecord, occurredAt: "not-a-date" })).toThrow();
  });
});

describe("records store", () => {
  it("appends and loads a record", async () => {
    await appendRecord(baseRecord);
    const records = await loadRecords("aiko-mori");
    expect(records).toEqual([baseRecord]);
  });

  it("rejects appending a duplicate id", async () => {
    await appendRecord(baseRecord);
    await expect(appendRecord(baseRecord)).rejects.toThrow("Duplicate record id");
  });

  it("generates sequential ids per record type", async () => {
    expect(await nextRecordId("nurse_observation")).toBe("rec-obs-001");
    await appendRecord(baseRecord);
    expect(await nextRecordId("nurse_observation")).toBe("rec-obs-002");
    expect(await nextRecordId("incident_report")).toBe("rec-incident-001");
  });
});

const baseProfile: LivingCareProfile = {
  residentId: "aiko-mori",
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

describe("profiles store", () => {
  it("saves and loads a profile version, and finds the latest", async () => {
    await saveProfileVersion(baseProfile);
    expect(await loadProfile("aiko-mori", 1)).toEqual(baseProfile);
    expect(await loadLatestProfile("aiko-mori")).toEqual(baseProfile);

    const v2 = { ...baseProfile, version: 2, handoffBrief: { ...baseProfile.handoffBrief, value: "Updated." } };
    await saveProfileVersion(v2);
    expect(await loadLatestProfile("aiko-mori")).toEqual(v2);
  });

  it("refuses to overwrite an existing profile version", async () => {
    await saveProfileVersion(baseProfile);
    await expect(saveProfileVersion(baseProfile)).rejects.toThrow("already exists");
  });

  it("returns null when no profile exists", async () => {
    expect(await loadLatestProfile("nobody")).toBeNull();
  });
});

const baseProposal: ProfileUpdateProposal = {
  id: "prop-001",
  residentId: "aiko-mori",
  baseVersion: 1,
  triggeredBy: ["rec-obs-001"],
  createdAt: "2026-07-05T00:00:00Z",
  changes: [
    {
      field: "handoffBrief",
      before: "Old.",
      after: "New.",
      citations: [],
      rationale: "New observation changed the handoff brief.",
    },
  ],
  status: "proposed",
};

describe("proposals store", () => {
  it("saves a proposal and updates its status", async () => {
    await saveProposal(baseProposal);
    expect(await loadProposals("aiko-mori")).toEqual([baseProposal]);

    const updated = await updateProposalStatus("prop-001", "approved");
    expect(updated.status).toBe("approved");
    const [stored] = await loadProposals("aiko-mori");
    expect(stored.status).toBe("approved");
  });

  it("throws when updating a proposal that does not exist", async () => {
    await expect(updateProposalStatus("missing", "approved")).rejects.toThrow("not found");
  });
});

describe("multi-resident isolation", () => {
  it("does not leak records across residentId filters", async () => {
    const kenjiRecord: CareRecord = {
      id: "rec-ks-900",
      residentId: "kenji-sato",
      type: "nurse_observation",
      occurredAt: "2026-07-01T12:00:00.000Z",
      author: { role: "nurse", name: "Kondo" },
      body: "Resident listened to the radio baseball broadcast this afternoon.",
    };

    await appendRecord(baseRecord);
    await appendRecord(kenjiRecord);

    const aikoRecords = await loadRecords("aiko-mori");
    expect(aikoRecords).toEqual([baseRecord]);

    const kenjiRecords = await loadRecords("kenji-sato");
    expect(kenjiRecords).toEqual([kenjiRecord]);

    const allRecords = await loadRecords();
    expect(allRecords).toHaveLength(2);
  });

  it("does not leak profile versions across residentId", async () => {
    const kenjiProfile: LivingCareProfile = {
      ...baseProfile,
      residentId: "kenji-sato",
      personSummary: { value: "Kenji summary text.", citations: [], updatedInVersion: 1 },
    };

    await saveProfileVersion(baseProfile);
    await saveProfileVersion(kenjiProfile);

    expect(await loadLatestProfile("aiko-mori")).toEqual(baseProfile);
    expect(await loadLatestProfile("kenji-sato")).toEqual(kenjiProfile);
    expect((await loadLatestProfile("aiko-mori"))?.personSummary.value).not.toBe(
      (await loadLatestProfile("kenji-sato"))?.personSummary.value,
    );
  });

  it("does not leak proposals across residentId filters", async () => {
    const kenjiProposal: ProfileUpdateProposal = {
      ...baseProposal,
      id: "prop-900",
      residentId: "kenji-sato",
    };

    await saveProposal(baseProposal);
    await saveProposal(kenjiProposal);

    expect(await loadProposals("aiko-mori")).toEqual([baseProposal]);
    expect(await loadProposals("kenji-sato")).toEqual([kenjiProposal]);
    expect(await loadProposals()).toHaveLength(2);
  });
});
