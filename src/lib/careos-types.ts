export type Resident = {
  name: string;
  age: number;
  room: string;
  baseline_traits: string[];
  timezone: string;
  language: string;
};

export type NoteRequest = {
  note: string;
  transcript?: string;
};

export type Citation = {
  note_id: string;
  quote: string;
};

export type ObservationCategory = "gait" | "sleep" | "appetite" | "agitation" | "medication" | "social" | "other";

export type DriftFlagData = {
  claim: string;
  severity: "watch" | "attention";
  citations: Citation[];
};

export type Observation = {
  category: ObservationCategory;
  text: string;
  note_id: string;
};

export type HandoffBrief = {
  summary: string;
  watch_items: string[];
  context_the_note_missed: string[];
};

export type CompilePayload = {
  result: {
    observations: Observation[];
    drift_flags: DriftFlagData[];
    handoff_brief: HandoffBrief;
  };
  verified: boolean;
  warnings: string[];
  latencyMs?: number;
  cached?: boolean;
};

export type CompileResponse = {
  mode: "on" | "off";
  payload: CompilePayload;
};
