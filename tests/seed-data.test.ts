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
  it("resident.json holds identity fields only", async () => {
    const resident = await readJson<Record<string, unknown>>(path.join(seedDataRoot(), "resident.json"));
    expect(resident).toEqual({
      name: "Aiko Mori",
      age: 84,
      room: "A-101",
      timezone: "Asia/Tokyo",
      language: "ja",
    });
    expect(resident).not.toHaveProperty("memory");
  });

  it("records.json entries validate against CareRecordSchema", async () => {
    const records = await readJson<unknown[]>(path.join(seedDataRoot(), "records.json"));
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(() => CareRecordSchema.parse(record)).not.toThrow();
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
});
