import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { dataRoot, isErrnoCode } from "./records";
import { LivingCareProfileSchema, ProfileUpdateProposalSchema, type LivingCareProfile, type ProfileUpdateProposal } from "./schema";

function profilesDir(residentId: string): string {
  return path.join(dataRoot(), "profiles", residentId);
}

function profileFilePath(residentId: string, version: number): string {
  return path.join(profilesDir(residentId), `v${version}.json`);
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tempFile = path.join(dir, `.${path.basename(filePath)}.tmp-${globalThis.process.pid}-${Date.now()}`);
  await writeFile(tempFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  try {
    await rename(tempFile, filePath);
  } catch (error) {
    await unlink(tempFile).catch(() => {});
    throw error;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) {
      return false;
    }
    throw error;
  }
}

export async function listProfileVersions(residentId: string): Promise<number[]> {
  try {
    const entries = await readdir(profilesDir(residentId));
    return entries
      .map((entry) => /^v(\d+)\.json$/.exec(entry))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => Number(match[1]))
      .sort((a, b) => a - b);
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) {
      return [];
    }
    throw error;
  }
}

export async function loadProfile(residentId: string, version: number): Promise<LivingCareProfile | null> {
  try {
    const raw = await readFile(profileFilePath(residentId, version), "utf8");
    return LivingCareProfileSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) {
      return null;
    }
    throw error;
  }
}

export async function loadLatestProfile(residentId: string): Promise<LivingCareProfile | null> {
  const versions = await listProfileVersions(residentId);
  if (versions.length === 0) return null;
  return loadProfile(residentId, versions[versions.length - 1]);
}

export async function saveProfileVersion(profile: LivingCareProfile): Promise<LivingCareProfile> {
  const parsed = LivingCareProfileSchema.parse(profile);
  const filePath = profileFilePath(parsed.residentId, parsed.version);
  if (await fileExists(filePath)) {
    throw new Error(`Profile version already exists: ${parsed.residentId} v${parsed.version}`);
  }
  await writeJsonAtomic(filePath, parsed);
  return parsed;
}

function proposalsFilePath(): string {
  return path.join(dataRoot(), "proposals.json");
}

async function readProposalsFile(): Promise<ProfileUpdateProposal[]> {
  try {
    const raw = await readFile(proposalsFilePath(), "utf8");
    const parsed = JSON.parse(raw) as unknown[];
    return parsed.map((entry) => ProfileUpdateProposalSchema.parse(entry));
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) {
      return [];
    }
    throw error;
  }
}

async function writeProposalsFile(proposals: ProfileUpdateProposal[]): Promise<void> {
  await writeJsonAtomic(proposalsFilePath(), proposals);
}

export async function loadProposals(residentId?: string): Promise<ProfileUpdateProposal[]> {
  const proposals = await readProposalsFile();
  return residentId ? proposals.filter((proposal) => proposal.residentId === residentId) : proposals;
}

export async function saveProposal(proposal: ProfileUpdateProposal): Promise<ProfileUpdateProposal> {
  const parsed = ProfileUpdateProposalSchema.parse(proposal);
  const proposals = await readProposalsFile();
  if (proposals.some((existing) => existing.id === parsed.id)) {
    throw new Error(`Duplicate proposal id: ${parsed.id}`);
  }
  proposals.push(parsed);
  await writeProposalsFile(proposals);
  return parsed;
}

export async function updateProposalStatus(
  id: string,
  status: ProfileUpdateProposal["status"],
): Promise<ProfileUpdateProposal> {
  const proposals = await readProposalsFile();
  const index = proposals.findIndex((proposal) => proposal.id === id);
  if (index === -1) {
    throw new Error(`Proposal not found: ${id}`);
  }
  const updated = ProfileUpdateProposalSchema.parse({ ...proposals[index], status });
  proposals[index] = updated;
  await writeProposalsFile(proposals);
  return updated;
}
