import type { CompileEnvelope, CompileResult, CareRecord, RecordType } from "./schema";
import type { HistoryNote, PatientMemory, Resident } from "./data";

export type { Resident, HistoryNote, PatientMemory, CareRecord, RecordType };

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
