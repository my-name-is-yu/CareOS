import type { CompileEnvelope, CompileResult } from "./schema";
import type { HistoryNote, Resident } from "./data";

export type { Resident, HistoryNote };

export type NoteRequest = {
  note: string;
};

export type CompilePayload = CompileEnvelope;
export type CompileResultPayload = CompileResult;
export type Citation = CompileResult["drift_flags"][number]["citations"][number];
export type DriftFlagData = CompileResult["drift_flags"][number];
export type Observation = CompileResult["observations"][number];
export type ObservationCategory = Observation["category"];
export type HandoffBrief = CompileResult["handoff_brief"];
