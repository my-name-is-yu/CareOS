import { Agent, run } from "@openai/agents";

import { CompileResultSchema, type CompileResult } from "./schema";
import type { HistoryNote, PatientMemory, Resident } from "./data";

export type CompileInput = {
  note: string;
  resident: Resident;
  memory: PatientMemory;
  history: HistoryNote[];
  extraInstruction?: string;
};

export const CareCompiler = new Agent({
  name: "CareCompiler",
  model: "gpt-4o",
  outputType: CompileResultSchema as never,
  instructions: [
    "Compile caregiver shift notes into structured handoff support.",
    "Never diagnose, prescribe, or claim clinical causality.",
    "Use the supplied current note, resident identity, patient memory, and full historical notes.",
    "Drift flags require verbatim historical citations with note_id and exact quote text.",
    "Use patient memory to surface operational context the current note omits, including baseline, cues, preferences, triggers, calming approaches, family context, recent history, and watch patterns.",
    "Observations drawn from the current note must use note_id \"live\"; observations drawn from history must cite the real note_id.",
  ].join("\n"),
});

export function assembleCompileInput(input: CompileInput): string {
  return JSON.stringify(
    {
      current_note: input.note,
      context: {
        resident: input.resident,
        memory: input.memory,
        history: input.history,
        instruction:
          "Memory is always on. Compare the current note against patient memory and all history. Include drift flags only when each flag has verbatim historical citations copied from history text.",
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
