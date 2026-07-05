import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadGBrainKnowledgeContext } from "./gbrain";

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

export type MemoryContext = {
  displayMemory: PatientMemory;
  gbrainContext: string | null;
  source: "json" | "gbrain";
};

type ResidentFile = Resident & { memory: PatientMemory };

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
  const resident = await readJson<ResidentFile>(path.join(dataRoot(), "resident.json"));
  return {
    name: resident.name,
    age: resident.age,
    room: resident.room,
    timezone: resident.timezone,
    language: resident.language,
  };
}

export async function loadJsonMemory(): Promise<PatientMemory> {
  const resident = await readJson<ResidentFile>(path.join(dataRoot(), "resident.json"));
  return resident.memory;
}

export async function loadMemoryContextForNote(currentNote?: string, residentInput?: Resident): Promise<MemoryContext> {
  const displayMemory = await loadJsonMemory();

  if (globalThis.process.env.CAREOS_MEMORY_BACKEND !== "gbrain") {
    return { displayMemory, gbrainContext: null, source: "json" };
  }

  try {
    const resident = residentInput ?? (await loadResident());
    return {
      displayMemory,
      gbrainContext: await loadGBrainKnowledgeContext(resident, currentNote),
      source: "gbrain",
    };
  } catch {
    return { displayMemory, gbrainContext: null, source: "json" };
  }
}

export async function loadMemoryForNote(currentNote?: string, residentInput?: Resident): Promise<PatientMemory> {
  return (await loadMemoryContextForNote(currentNote, residentInput)).displayMemory;
}

export async function loadMemory(): Promise<PatientMemory> {
  return loadMemoryForNote();
}

export async function loadHistory(): Promise<HistoryNote[]> {
  return readJson<HistoryNote[]>(path.join(dataRoot(), "history.json"));
}
