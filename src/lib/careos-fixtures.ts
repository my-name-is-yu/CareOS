import type { CompilePayload, PatientMemory, Resident } from "@/src/lib/careos-types";

export const defaultResident: Resident = {
  name: "Default Resident",
  age: 84,
  room: "A-101",
  timezone: "Asia/Tokyo",
  language: "ja"
};

export const defaultMemory: PatientMemory = {
  baseline: ["slow gait", "uses walker", "prefers calm communication"],
  communication_cues: ["Use short calm prompts.", "Allow extra time for response."],
  preferences: ["Quiet room.", "Steady walker support."],
  known_triggers: ["Corridor noise can increase agitation."],
  calming_approaches: ["Reduce corridor noise.", "Keep the room quiet.", "Re-approach with calm wording."],
  family_context_notes: ["No family context notes loaded."],
  recent_history: ["Resident refused evening medication twice this week."],
  watch_patterns: ["Slower gait near hallway turns.", "Repeated evening medication refusal.", "Noise sensitivity."]
};

export const fixtureOn: CompilePayload = {
  result: {
    observations: [
      {
        category: "gait",
        text: "Resident walked slower than baseline after lunch; gait looked cautious near the hallway turn.",
        note_id: "note-001"
      },
      {
        category: "medication",
        text: "Resident again refused medication and repeated the refusal phrase.",
        note_id: "note-005"
      }
    ],
    drift_flags: [
      {
        claim: "Medication refusal is recurring.",
        severity: "watch",
        citations: [
          {
            note_id: "note-002",
            quote: "Resident refused the evening medication and said, 'I do not want it tonight.'"
          }
        ]
      }
    ],
    handoff_brief: {
      summary: "Track gait slowness and repeat medication refusal across recent shifts.",
      watch_items: ["mobility", "med adherence", "noise sensitivity"],
      context_the_note_missed: [
        "The record shows repeated refusal language and corridor-noise sensitivity that should stay linked."
      ]
    }
  },
  verified: true,
  warnings: [],
  latencyMs: 0,
  cached: true
};

export const fixtureOff: CompilePayload = {
  result: {
    observations: [
      {
        category: "other",
        text: "No active drift signals were surfaced in the cached off fixture.",
        note_id: "note-001"
      }
    ],
    drift_flags: [],
    handoff_brief: {
      summary: "Use the off fixture as a neutral control sample.",
      watch_items: ["baseline mobility", "quiet routine"],
      context_the_note_missed: []
    }
  },
  verified: true,
  warnings: [],
  latencyMs: 0,
  cached: true
};
