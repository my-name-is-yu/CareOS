import { Agent, run } from "@openai/agents";

import { CompileResultSchema, type CompileResult, type Mode } from "./schema";
import type { HistoryNote, Resident } from "./data";

export type CompileInput = {
  note: string;
  mode: Mode;
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
    "Never diagnose, prescribe, or claim clinical causality.",
    "Use only the supplied current note and, in context-on mode, supplied historical notes.",
    "Drift flags require verbatim historical citations with note_id and exact quote text.",
    "If context is empty, return no drift_flags and keep context_the_note_missed empty.",
  ].join("\n"),
});

export function assembleCompileInput(input: CompileInput): string {
  const context =
    input.mode === "on"
      ? {
          resident: input.resident,
          history: input.history,
          instruction:
            "Context is ON. Compare the note against all history. Include drift flags only when each flag has verbatim historical citations copied from history text.",
        }
      : {
          resident: null,
          history: [],
          instruction:
            "Context is OFF. Use the current note only. Leave drift_flags empty and context_the_note_missed empty.",
        };

  return JSON.stringify(
    {
      mode: input.mode,
      current_note: input.note,
      context,
      output_contract:
        "Return CompileResult JSON with observations, drift_flags, and handoff_brief. Categories are gait, sleep, appetite, agitation, medication, social, other. Severity is watch or attention.",
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
