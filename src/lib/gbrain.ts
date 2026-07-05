import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Resident } from "./data";

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
