import type { CompilePayload, Resident } from "@/src/lib/careos-types";

export const defaultResident: Resident = {
  name: "Default Resident",
  age: 84,
  room: "A-101",
  timezone: "Asia/Tokyo",
  language: "ja",
};

export const sampleCompilePayload: CompilePayload = {
  result: {
    observations: [
      {
        category: "gait",
        text: "Resident walked slower than baseline after lunch; gait looked cautious near the hallway turn.",
        note_id: "note-001",
      },
      {
        category: "medication",
        text: "Resident again refused medication and repeated the refusal phrase.",
        note_id: "note-005",
      },
    ],
    drift_flags: [
      {
        claim: "Medication refusal is recurring.",
        severity: "watch",
        citations: [
          {
            note_id: "note-002",
            quote: "Resident refused the evening medication and said, 'I do not want it tonight.'",
          },
        ],
      },
    ],
    handoff_brief: {
      summary: "Track gait slowness and repeat medication refusal across recent shifts.",
      watch_items: ["mobility", "med adherence", "noise sensitivity"],
      context_the_note_missed: [
        "The record shows repeated refusal language and corridor-noise sensitivity that should stay linked.",
      ],
    },
  },
  verified: true,
  warnings: [],
  latencyMs: 0,
};
