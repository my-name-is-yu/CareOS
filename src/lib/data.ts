import { readFile } from "node:fs/promises";
import path from "node:path";

function dataRoot(): string {
  return path.join(globalThis.process.cwd(), "data");
}

export type Resident = {
  name: string;
  age: number;
  room: string;
  timezone: string;
  language: string;
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

export type HistoryNote = {
  note_id: string;
  date: string;
  shift: string;
  author: string;
  text: string;
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

export async function loadMemory(): Promise<PatientMemory> {
  const { memory } = await readJson<ResidentRecord>(path.join(dataRoot(), "resident.json"));
  return memory;
}

export async function loadHistory(): Promise<HistoryNote[]> {
  return readJson<HistoryNote[]>(path.join(dataRoot(), "history.json"));
}
