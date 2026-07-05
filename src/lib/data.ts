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

type ResidentFile = Resident;

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
