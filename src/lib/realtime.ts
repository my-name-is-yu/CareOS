import type { Resident } from "./data";
import type { CareRecord, LivingCareProfile } from "./schema";

export const realtimeModel = "gpt-realtime-2";

export type RealtimeClientSecretResponse = {
  clientSecret: {
    value: string;
    expiresAt: number;
  };
};

export type RealtimeInstructionsInput = {
  resident: Resident;
  profile: LivingCareProfile | null;
  recentRecords: CareRecord[];
};

function listSection(title: string, values: string[]): string {
  return [`${title}:`, ...(values.length > 0 ? values.map((value) => `- ${value}`) : ["- Not loaded."])].join("\n");
}

/**
 * Builds the realtime nursing-support agent instructions, grounded on the
 * latest APPROVED Living Care Profile plus the most recent care records.
 * Never invents facts outside of the approved profile or the loaded records.
 */
export function buildRealtimeInstructions({ resident, profile, recentRecords }: RealtimeInstructionsInput): string {
  const recentNotes = recentRecords
    .map((record) => `- ${record.occurredAt} ${record.type} ${record.author.name ?? record.author.role} (${record.id}): ${record.body}`)
    .join("\n");

  const careRecommendations = profile?.careRecommendations.value.map((item) => `${item.situation} -> ${item.approach}`) ?? [];
  const trendFlags = profile?.trendFlags.value.map((item) => `[${item.severity}] ${item.claim}`) ?? [];
  const recentChanges = profile?.recentChanges.value.map((item) => `[${item.direction}] ${item.description}`) ?? [];

  return [
    "You are the CareOS realtime nursing support agent for dementia-care staff.",
    "Ground every answer in the approved Living Care Profile below and the most recent care records. Do not invent facts that are not present there or in the user's current observation.",
    `Resident: ${resident.name}, age ${resident.age}, room ${resident.room}.`,
    `Preferred care language: ${resident.language}. Timezone: ${resident.timezone}.`,
    "Care workflow:",
    "- Answer questions from the approved profile when possible and cite the relevant field in plain language.",
    "- Ask for missing observations such as time, behavior, intake, mobility, pain cues, sleep, medication refusal, environment, and safety risks.",
    "- Suggest nursing checks, monitoring steps, and handoff wording for a licensed staff member to review.",
    "- Draft concise handoff text when asked.",
    "- Refuse diagnosis, prescribing, medication changes, restraints, or autonomous care decisions. Direct staff to facility policy and licensed clinicians for those decisions.",
    `Approved Living Care Profile (version ${profile?.version ?? "none"}):`,
    profile ? `Person summary: ${profile.personSummary.value}` : "- No approved profile loaded yet.",
    profile ? `Handoff brief: ${profile.handoffBrief.value}` : "",
    listSection("Recent changes", recentChanges),
    listSection("Calming approaches", profile?.calmingApproaches.value ?? []),
    listSection("Known triggers", profile?.knownTriggers.value ?? []),
    listSection("Care recommendations", careRecommendations),
    listSection("Trend flags", trendFlags),
    "Recent care records:",
    recentNotes || "- No recent care records loaded.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}
