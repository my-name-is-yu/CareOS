import { Agent, run } from "@openai/agents";

import { CompileResultSchema, type CompileResult } from "./schema";
import type { HistoryNote, Resident } from "./data";

export type CompileInput = {
  note: string;
  resident: Resident;
  history: HistoryNote[];
  extraInstruction?: string;
};

export const CareCompiler = new Agent({
  name: "CareCompiler",
  model: "gpt-4o",
  outputType: CompileResultSchema as never,
  instructions: [
    "Compile caregiver shift notes into structured handoff support.",
    "Never diagnose, prescribe, suggest dosage changes, or claim clinical causality.",
    "Never make autonomous care decisions; surface observations and missing nursing checks for human review.",
    "Use only the supplied current note, resident memory, and historical notes.",
    "Drift flags require verbatim historical citations with note_id and exact quote text.",
    "Observations drawn from the current note must use note_id \"live\"; observations drawn from history must cite the real note_id.",
  ].join("\n"),
});

export function assembleCompileInput(input: CompileInput): string {
  return JSON.stringify(
    {
      current_note: input.note,
      resident_memory: {
        resident: input.resident,
        history: input.history,
        instruction:
          "Memory is always included. Compare the current note against resident profile and all history. Include drift flags only when each flag has verbatim historical citations copied from history text. In context_the_note_missed, surface missing nursing checks or context the incoming shift should verify.",
      },
      output_contract:
        'Return CompileResult JSON with observations, drift_flags, and handoff_brief. Categories are gait, sleep, appetite, agitation, medication, social, other. Severity is watch or attention. Every observation drawn from the current note must set note_id to "live"; observations drawn from history must use the real historical note_id.',
      extra_instruction: input.extraInstruction ?? null,
    },
    null,
    2,
  );
}

export async function runCareCompiler(input: CompileInput): Promise<CompileResult> {
  const result = await run(CareCompiler as unknown as Agent<any, any>, assembleCompileInput(input));
  return CompileResultSchema.parse(result.finalOutput);
}
