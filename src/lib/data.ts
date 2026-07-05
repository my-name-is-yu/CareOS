import { readFile } from "node:fs/promises";
import path from "node:path";

function dataRoot(): string {
  return path.join(globalThis.process.cwd(), "data");
}

export type Resident = {
  id: string;
  name: string;
  age: number;
  room: string;
  timezone: string;
  language: string;
};

type ResidentsFile = Resident[];

export const DEFAULT_RESIDENT_ID = "aiko-mori";

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function loadResidents(): Promise<Resident[]> {
  const residents = await readJson<ResidentsFile>(path.join(dataRoot(), "residents.json"));
  return residents.map((resident) => ({
    id: resident.id,
    name: resident.name,
    age: resident.age,
    room: resident.room,
    timezone: resident.timezone,
    language: resident.language,
  }));
}

export async function loadResident(residentId: string = DEFAULT_RESIDENT_ID): Promise<Resident> {
  const residents = await loadResidents();
  const resident = residents.find((entry) => entry.id === residentId);
  if (!resident) {
    throw new Error(`Unknown resident id: ${residentId}`);
  }
  return resident;
}
