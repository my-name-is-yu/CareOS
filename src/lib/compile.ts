import { assembleCompileInput, runCareCompiler, type CompileInput } from "./agent";
import { loadHistory, loadResident } from "./data";
import { lintClinicalLanguage } from "./lint";
import { CompileEnvelopeSchema, type CompileEnvelope, type CompileResult } from "./schema";
import { needsCorrectiveRerun, verifyCompileResult } from "./verify";

const correctiveInstruction =
  "Previous drift flags had unsupported citations. Return drift_flags only if every citation quote is copied verbatim from the provided history text.";

export type CompileRequestBody = {
  note?: unknown;
};

export function buildCompileInput(input: CompileInput): string {
  return assembleCompileInput(input);
}

export async function compileFromBody(
  body: CompileRequestBody,
  options: { hasOpenAIKey?: boolean; now?: () => number } = {},
): Promise<CompileEnvelope> {
  const started = options.now?.() ?? Date.now();
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!note) {
    throw new Error("Missing note.");
  }

  const hasOpenAIKey = options.hasOpenAIKey ?? Boolean(globalThis.process?.env.OPENAI_API_KEY);
  if (!hasOpenAIKey) {
    throw new Error("OPENAI_API_KEY is required for compile.");
  }

  const [resident, history] = await Promise.all([loadResident(), loadHistory()]);
  const baseInput = { note, resident, history };
  let rawResult: CompileResult = await runCareCompiler(baseInput);
  let verification = verifyCompileResult(rawResult, history);

  if (needsCorrectiveRerun(verification)) {
    rawResult = await runCareCompiler({ ...baseInput, extraInstruction: correctiveInstruction });
    verification = verifyCompileResult(rawResult, history);
  }

  const envelope = CompileEnvelopeSchema.parse({
    result: verification.result,
    verified: verification.verified,
    warnings: lintClinicalLanguage(verification.result),
    latencyMs: Math.max(0, (options.now?.() ?? Date.now()) - started),
  });

  return envelope;
}
