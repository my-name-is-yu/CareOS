import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CareRecordSchema, LivingCareProfileSchema, ProfileUpdateProposalSchema } from "../src/lib/schema";

function seedDataRoot(): string {
  return path.join(globalThis.process.cwd(), "data");
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

describe("seed data validity", () => {
  it("residents.json holds ten resident identities including aiko-mori and kenji-sato", async () => {
    const residents = await readJson<Array<Record<string, unknown>>>(path.join(seedDataRoot(), "residents.json"));
    expect(Array.isArray(residents)).toBe(true);
    expect(residents).toHaveLength(10);
    expect(new Set(residents.map((resident) => resident.id))).toHaveLength(10);

    const aikoMori = residents.find((resident) => resident.id === "aiko-mori");
    expect(aikoMori).toEqual({
      id: "aiko-mori",
      name: "Aiko Mori",
      age: 84,
      room: "A-101",
      timezone: "Asia/Tokyo",
      language: "ja",
    });
    expect(aikoMori).not.toHaveProperty("memory");

    const kenjiSato = residents.find((resident) => resident.id === "kenji-sato");
    expect(kenjiSato).toEqual({
      id: "kenji-sato",
      name: "Kenji Sato",
      age: 79,
      room: "B-203",
      timezone: "Asia/Tokyo",
      language: "ja",
    });
  });

  it("records.json entries validate against CareRecordSchema", async () => {
    const records = await readJson<unknown[]>(path.join(seedDataRoot(), "records.json"));
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(() => CareRecordSchema.parse(record)).not.toThrow();
    }
  });

  it("records.json includes care records for every resident", async () => {
    const residents = await readJson<Array<{ id: string }>>(path.join(seedDataRoot(), "residents.json"));
    const records = await readJson<Array<{ residentId: string }>>(path.join(seedDataRoot(), "records.json"));
    for (const resident of residents) {
      expect(records.filter((record) => record.residentId === resident.id).length).toBeGreaterThan(0);
    }
  });

  it("proposals.json validates against ProfileUpdateProposalSchema", async () => {
    const proposals = await readJson<unknown[]>(path.join(seedDataRoot(), "proposals.json"));
    for (const proposal of proposals) {
      expect(() => ProfileUpdateProposalSchema.parse(proposal)).not.toThrow();
    }
  });

  it("profiles/aiko-mori/v1.json validates against LivingCareProfileSchema", async () => {
    const profile = await readJson<unknown>(path.join(seedDataRoot(), "profiles", "aiko-mori", "v1.json"));
    const parsed = LivingCareProfileSchema.parse(profile);
    expect(parsed.residentId).toBe("aiko-mori");
    expect(parsed.version).toBe(1);
  });

  it("profiles/kenji-sato/v1.json validates against LivingCareProfileSchema", async () => {
    const profile = await readJson<unknown>(path.join(seedDataRoot(), "profiles", "kenji-sato", "v1.json"));
    const parsed = LivingCareProfileSchema.parse(profile);
    expect(parsed.residentId).toBe("kenji-sato");
    expect(parsed.version).toBe(1);
    expect(parsed.approvedBy).toBe("seed-migration");
    expect(parsed.trendFlags.value.some((flag) => flag.severity === "watch")).toBe(true);
  });

  it("each resident has a valid v1 Living Care Profile", async () => {
    const residents = await readJson<Array<{ id: string }>>(path.join(seedDataRoot(), "residents.json"));
    for (const resident of residents) {
      const profile = await readJson<unknown>(path.join(seedDataRoot(), "profiles", resident.id, "v1.json"));
      const parsed = LivingCareProfileSchema.parse(profile);
      expect(parsed.residentId).toBe(resident.id);
      expect(parsed.version).toBe(1);
      expect(parsed.approvedBy).toBe("seed-migration");
    }
  });
});
