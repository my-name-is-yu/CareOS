import { Agent } from "@openai/agents";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";

import { CompileResultSchema, type CompileResult } from "./schema";
import type { HistoryNote, PatientMemory, Resident } from "./data";

export type CompileInput = {
  note: string;
  resident: Resident;
  memory: PatientMemory;
  gbrainContext?: string | null;
  history: HistoryNote[];
  extraInstruction?: string;
};

const careCompilerInstructions = [
  "Compile caregiver shift notes into structured handoff support.",
  "Never diagnose, prescribe, or claim clinical causality.",
  "Use the supplied current note, resident identity, patient memory, and full historical notes.",
  "When G-Brain patient knowledge is supplied, treat that full retrieved context as the primary patient memory source instead of extracting or rewriting it.",
  "Drift flags require verbatim historical citations with note_id and exact quote text.",
  "Use patient memory to surface operational context the current note omits, including baseline, cues, preferences, triggers, calming approaches, family context, recent history, and watch patterns.",
  "Observations drawn from the current note must use note_id \"live\"; observations drawn from history must cite the real note_id.",
].join("\n");

export const CareCompiler = new Agent({
  name: "CareCompiler",
  model: "gpt-4o",
  outputType: CompileResultSchema as never,
  instructions: careCompilerInstructions,
});

export function assembleCompileInput(input: CompileInput): string {
  return JSON.stringify(
    {
      current_note: input.note,
      context: {
        resident: input.resident,
        memory: input.memory,
        gbrain_knowledge_context: input.gbrainContext ?? null,
        history: input.history,
        instruction:
          "Memory is always on. Compare the current note against G-Brain patient knowledge when present, display patient memory, and all history. Include drift flags only when each flag has verbatim historical citations copied from history text.",
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
  const openai = new OpenAI({ apiKey: globalThis.process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.parse({
    model: "gpt-4o",
    messages: [
      { role: "system", content: careCompilerInstructions },
      { role: "user", content: assembleCompileInput(input) },
    ],
    response_format: zodResponseFormat(CompileResultSchema, "compile_result"),
  });
  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) {
    throw new Error("CareCompiler returned no parsed output.");
  }
  return CompileResultSchema.parse(parsed);
}
