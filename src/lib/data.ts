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
  return readJson<Resident>(path.join(dataRoot(), "resident.json"));
}

export async function loadMemory(): Promise<PatientMemory> {
  const resident = await readJson<Resident & { memory: PatientMemory }>(path.join(dataRoot(), "resident.json"));
  return resident.memory;
}

export async function loadHistory(): Promise<HistoryNote[]> {
  return readJson<HistoryNote[]>(path.join(dataRoot(), "history.json"));
}
