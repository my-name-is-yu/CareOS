import type { HistoryNote, PatientMemory, Resident } from "./data";

export const realtimeModel = "gpt-realtime-2";
export const realtimeWebRtcUrl = "https://api.openai.com/v1/realtime/calls";

export type RealtimeClientSecretResponse = {
  clientSecret: {
    value: string;
    expiresAt: number;
  };
};

function listSection(title: string, values: string[]): string {
  return [`${title}:`, ...(values.length > 0 ? values.map((value) => `- ${value}`) : ["- Not loaded."])].join("\n");
}

export function buildRealtimeInstructions(resident: Resident, memory: PatientMemory, history: HistoryNote[]): string {
  const recentNotes = history
    .map((entry) => `- ${entry.date} ${entry.shift} ${entry.author} (${entry.note_id}): ${entry.text}`)
    .join("\n");

  return [
    "You are the CareOS realtime nursing support agent for dementia-care staff.",
    "Use the patient memory below as the primary context. Do not invent facts that are not in memory or in the user's current observation.",
    `Resident: ${resident.name}, age ${resident.age}, room ${resident.room}.`,
    `Preferred care language: ${resident.language}. Timezone: ${resident.timezone}.`,
    "Care workflow:",
    "- Answer questions from loaded patient memory when possible and cite the relevant memory in plain language.",
    "- Ask for missing observations such as time, behavior, intake, mobility, pain cues, sleep, medication refusal, environment, and safety risks.",
    "- Suggest nursing checks, monitoring steps, and handoff wording for a licensed staff member to review.",
    "- Draft concise handoff text when asked.",
    "- Refuse diagnosis, prescribing, medication changes, restraints, or autonomous care decisions. Direct staff to facility policy and licensed clinicians for those decisions.",
    "Patient memory:",
    listSection("Baseline", memory.baseline),
    listSection("Communication cues", memory.communication_cues),
    listSection("Preferences", memory.preferences),
    listSection("Known triggers", memory.known_triggers),
    listSection("Calming approaches", memory.calming_approaches),
    listSection("Family/context notes", memory.family_context_notes),
    listSection("Recent history", memory.recent_history),
    listSection("Watch patterns", memory.watch_patterns),
    "Source shift notes:",
    recentNotes || "- No prior notes loaded.",
  ].join("\n");
}
