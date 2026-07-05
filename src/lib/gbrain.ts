import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { Resident } from "./data";
import type { CareRecord } from "./schema";

const execFileAsync = promisify(execFile);

export function buildGBrainQuery(resident: Resident, currentNote?: string): string {
  return [
    `resident ${resident.name}`,
    `room ${resident.room}`,
    "care baseline communication preferences triggers calming family recent history watch patterns",
    currentNote ? `current note ${currentNote}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export async function loadGBrainKnowledgeContext(resident: Resident, currentNote?: string): Promise<string> {
  const command = globalThis.process.env.GBRAIN_COMMAND || "gbrain";
  const operation = globalThis.process.env.GBRAIN_OPERATION || "search";
  const timeout = Number(globalThis.process.env.GBRAIN_TIMEOUT_MS || "4000");
  const query = buildGBrainQuery(resident, currentNote);
  const { stdout, stderr } = await execFileAsync(command, [operation, query], {
    cwd: globalThis.process.cwd(),
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 4000,
    maxBuffer: 1024 * 1024,
  });
  const output = `${stdout ?? ""}\n${stderr ?? ""}`.trim();
  if (!output) {
    throw new Error("G-Brain returned no patient knowledge output.");
  }
  return output;
}

export async function syncRecordToGBrain(record: CareRecord): Promise<void> {
  if (globalThis.process.env.CAREOS_MEMORY_BACKEND !== "gbrain") {
    return;
  }

  try {
    const dir = path.join(globalThis.process.cwd(), "brain", "residents", "records");
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${record.id}.md`);
    const header = [
      `type: ${record.type}`,
      `date: ${record.occurredAt}`,
      `author: ${record.author.name ? `${record.author.name} (${record.author.role})` : record.author.role}`,
      `residentId: ${record.residentId}`,
    ].join("\n");
    await writeFile(filePath, `${header}\n\n${record.body}\n`, "utf8");

    const command = globalThis.process.env.GBRAIN_COMMAND || "gbrain";
    const timeout = Number(globalThis.process.env.GBRAIN_TIMEOUT_MS || "4000");
    await execFileAsync(command, ["import", "brain"], {
      cwd: globalThis.process.cwd(),
      timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 4000,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    console.warn("G-Brain sync failed; continuing without it.", error);
  }
}
