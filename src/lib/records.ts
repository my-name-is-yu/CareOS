import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { CareRecordSchema, type CareRecord, type RecordType } from "./schema";

export function dataRoot(): string {
  return globalThis.process.env.CAREOS_DATA_DIR || path.join(globalThis.process.cwd(), "data");
}

export function isErrnoCode(error: unknown, code: string): boolean {
  return Boolean(error) && typeof error === "object" && (error as { code?: string }).code === code;
}

function recordsFilePath(): string {
  return path.join(dataRoot(), "records.json");
}

async function readRecordsFile(): Promise<CareRecord[]> {
  try {
    const raw = await readFile(recordsFilePath(), "utf8");
    const parsed = JSON.parse(raw) as unknown[];
    return parsed.map((entry) => CareRecordSchema.parse(entry));
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) {
      return [];
    }
    throw error;
  }
}

async function writeRecordsFile(records: CareRecord[]): Promise<void> {
  const dir = dataRoot();
  await mkdir(dir, { recursive: true });
  const target = recordsFilePath();
  const tempFile = path.join(dir, `.records.json.tmp-${globalThis.process.pid}-${Date.now()}`);
  await writeFile(tempFile, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  try {
    await rename(tempFile, target);
  } catch (error) {
    await unlink(tempFile).catch(() => {});
    throw error;
  }
}

export async function loadRecords(residentId?: string): Promise<CareRecord[]> {
  const records = await readRecordsFile();
  return residentId ? records.filter((record) => record.residentId === residentId) : records;
}

export async function appendRecord(record: CareRecord): Promise<CareRecord> {
  const parsed = CareRecordSchema.parse(record);
  const records = await readRecordsFile();
  if (records.some((existing) => existing.id === parsed.id)) {
    throw new Error(`Duplicate record id: ${parsed.id}`);
  }
  records.push(parsed);
  await writeRecordsFile(records);
  return parsed;
}

const recordTypePrefixes: Record<RecordType, string> = {
  soap_note: "soap",
  nurse_observation: "obs",
  family_memory: "family",
  medication_record: "med",
  incident_report: "incident",
};

export async function nextRecordId(type: RecordType): Promise<string> {
  const prefix = recordTypePrefixes[type];
  const records = await readRecordsFile();
  const pattern = new RegExp(`^rec-${prefix}-(\\d+)$`);
  let max = 0;
  for (const record of records) {
    const match = pattern.exec(record.id);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  const next = max + 1;
  return `rec-${prefix}-${String(next).padStart(3, "0")}`;
}
