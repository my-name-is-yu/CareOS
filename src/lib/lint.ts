import type { CompileResult } from "./schema";

export function lintClinicalLanguage(result: CompileResult): string[] {
  const text = JSON.stringify(result).toLowerCase();
  if (text.includes("diagnose") || text.includes("prescribe")) {
    return ["Review language for clinical, diagnostic, or prescribing claims."];
  }
  return [];
}
