import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { CompileEnvelopeSchema, type CompileEnvelope, ModeSchema, type Mode } from "./schema";

function dataRoot(): string {
  return path.join(globalThis.process.cwd(), "data");
}

function cacheRoot(): string {
  return path.join(dataRoot(), "cache");
}

export type Resident = {
  name: string;
  age: number;
  room: string;
  timezone: string;
  language: string;
};

export type HistoryNote = {
  note_id: string;
  date: string;
  shift: string;
  author: string;
  text: string;
};

export type PatientMemory = {
  baseline: string[];
  communication_cues: string[];
  preferences: string[];
  known_triggers: string[];
  calming_approaches: string[];
  family_context_notes: string[];
  recent_history: string[];
  watch_patterns: string[];
};

type ResidentRecord = Resident & {
  memory: PatientMemory;
};

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function loadResident(): Promise<Resident> {
  const record = await readJson<ResidentRecord>(path.join(dataRoot(), "resident.json"));
  return {
    name: record.name,
    age: record.age,
    room: record.room,
    timezone: record.timezone,
    language: record.language,
  };
}

export async function loadHistory(): Promise<HistoryNote[]> {
  return readJson<HistoryNote[]>(path.join(dataRoot(), "history.json"));
}

export async function loadMemory(): Promise<PatientMemory> {
  const resident = await readJson<ResidentRecord>(path.join(dataRoot(), "resident.json"));
  return resident.memory;
}

export function cachePathForMode(mode: Mode): string {
  return path.join(cacheRoot(), `${mode}.json`);
}

export function fixturePathForMode(mode: Mode): string {
  return path.join(cacheRoot(), `fixture-${mode}.json`);
}

export async function readEnvelopeFile(filePath: string): Promise<CompileEnvelope | null> {
  try {
    return CompileEnvelopeSchema.parse(await readJson<unknown>(filePath));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function readCachedCompile(modeInput: string): Promise<CompileEnvelope | null> {
  const mode = ModeSchema.parse(modeInput);
  return readEnvelopeFile(cachePathForMode(mode));
}

export async function readFixtureCompile(modeInput: string): Promise<CompileEnvelope | null> {
  const mode = ModeSchema.parse(modeInput);
  return readEnvelopeFile(fixturePathForMode(mode));
}

export async function readDemoCompile(mode: Mode): Promise<CompileEnvelope | null> {
  return (await readCachedCompile(mode)) ?? (await readFixtureCompile(mode));
}

export async function writeCachedCompile(mode: Mode, envelope: CompileEnvelope): Promise<void> {
  await mkdir(cacheRoot(), { recursive: true });
  await writeFile(cachePathForMode(mode), `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
}
