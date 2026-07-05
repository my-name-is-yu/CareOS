import type { HistoryNote, Resident } from "./data";

export const realtimeModel = "gpt-4o-realtime-preview-2025-06-03";

export type RealtimeClientSecretResponse = {
  clientSecret: {
    value: string;
    expiresAt: number;
  };
};

export function buildRealtimeInstructions(resident: Resident, history: HistoryNote[]): string {
  const memory = history
    .map((entry) => `- ${entry.date} ${entry.shift} ${entry.author} (${entry.note_id}): ${entry.text}`)
    .join("\n");

  return [
    "You are the CareOS realtime nursing support agent for dementia-care staff.",
    "Use the resident memory below as the primary context. Do not invent facts that are not in memory or in the user's current observation.",
    `Resident: ${resident.name}, age ${resident.age}, room ${resident.room}.`,
    `Baseline traits: ${resident.baseline_traits.join(", ")}.`,
    `Preferred care language: ${resident.language}. Timezone: ${resident.timezone}.`,
    "Care workflow:",
    "- Answer questions from resident memory when possible and cite the relevant memory in plain language.",
    "- Ask for missing observations such as time, behavior, intake, mobility, pain cues, sleep, medication refusal, environment, and safety risks.",
    "- Suggest nursing checks, monitoring steps, and handoff wording for a licensed staff member to review.",
    "- Draft concise handoff text when asked.",
    "- Refuse diagnosis, prescribing, medication changes, restraints, or autonomous care decisions. Direct staff to facility policy and licensed clinicians for those decisions.",
    "Resident memory:",
    memory || "- No prior notes loaded.",
  ].join("\n");
}
