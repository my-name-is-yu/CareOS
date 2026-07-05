import type { CompileResult } from "./schema";
import { CompileResultSchema } from "./schema";

export function normalizeCitationText(text: string): string {
  return text
    .trim()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function verifyCompileResult(
  result: CompileResult,
  history: Array<{ note_id: string; text: string }>,
): {
  result: CompileResult;
  verified: boolean;
  droppedCitations: number;
  droppedFlags: number;
} {
  const parsed = CompileResultSchema.parse(result);
  let droppedCitations = 0;
  let droppedFlags = 0;
  const allowed = new Map(history.map((entry) => [entry.note_id, normalizeCitationText(entry.text)]));
  const drift_flags = parsed.drift_flags
    .map((flag) => {
      const citations = flag.citations.filter((citation) => {
        const source = allowed.get(citation.note_id);
        if (!source) return false;
        return source.includes(normalizeCitationText(citation.quote));
      });
      droppedCitations += flag.citations.length - citations.length;
      if (!citations.length) {
        droppedFlags += 1;
        return null;
      }
      return { ...flag, citations };
    })
    .filter((flag): flag is NonNullable<typeof flag> => Boolean(flag));
  return { result: { ...parsed, drift_flags }, verified: droppedFlags === 0 && droppedCitations === 0, droppedCitations, droppedFlags };
}

export function needsCorrectiveRerun(verification: { droppedFlags: number; result: CompileResult }): boolean {
  return verification.droppedFlags > 0 && verification.result.drift_flags.length === 0;
}
