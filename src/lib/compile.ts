import { assembleCompileInput, runCareCompiler, type CompileInput } from "./agent";
import { loadHistory, loadResident, readDemoCompile, writeCachedCompile } from "./data";
import { lintClinicalLanguage } from "./lint";
import { CompileEnvelopeSchema, ModeSchema, type CompileEnvelope, type CompileResult } from "./schema";
import { needsCorrectiveRerun, verifyCompileResult } from "./verify";

const correctiveInstruction =
  "Previous drift flags had unsupported citations. Return drift_flags only if every citation quote is copied verbatim from the provided history text.";

export type CompileRequestBody = {
  note?: unknown;
  mode?: unknown;
  cached?: unknown;
};

export function buildCompileInput(input: CompileInput): string {
  return assembleCompileInput(input);
}

export async function compileFromBody(
  body: CompileRequestBody,
  options: { hasOpenAIKey?: boolean; now?: () => number } = {},
): Promise<CompileEnvelope> {
  const started = options.now?.() ?? Date.now();
  const mode = ModeSchema.parse(body.mode ?? "on");
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const wantsCached = body.cached === true || body.cached === "true";

  if (!note && !wantsCached) {
    throw new Error("Missing note.");
  }

  const hasOpenAIKey = options.hasOpenAIKey ?? Boolean(globalThis.process?.env.OPENAI_API_KEY);
  if (wantsCached || !hasOpenAIKey) {
    const cached = await readDemoCompile(mode);
    if (cached) return { ...cached, cached: true };
    throw new Error(hasOpenAIKey ? "Cached compile result not found." : "OPENAI_API_KEY is required and no cached demo result exists.");
  }

  const [resident, history] = await Promise.all([loadResident(), loadHistory()]);
  const baseInput = { note, mode, resident, history };
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
    cached: false,
  });

  await writeCachedCompile(mode, envelope);
  return envelope;
}
