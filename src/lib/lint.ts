const clinicalPatterns = [
  /diagnos/i,
  /prescri/i,
  /dosage/i,
  /disease/i,
  /parkinson/i,
  /alzheim/i,
  /progression of dementia/i,
  /\bdementia\b/i,
  /\bdepress(?:ion|ed|ive)\b/i,
  /\banxiety disorder\b/i,
  /\bmedicat(?:e|ion) should\b/i,
  /\bincrease (?:the )?dose\b/i,
  /\bdecrease (?:the )?dose\b/i,
  /\bstart (?:a )?(?:drug|medication|medicine)\b/i,
  /\bstop (?:the )?(?:drug|medication|medicine)\b/i,
  /\btreat(?:ment)? plan\b/i,
];

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
  return [];
}

export function lintClinicalLanguage(value: unknown): string[] {
  const text = collectStrings(value).join("\n");
  const warnings = new Set<string>();

  for (const pattern of clinicalPatterns) {
    if (pattern.test(text)) {
      warnings.add("Review language for clinical, diagnostic, or prescribing claims.");
    }
  }

  return [...warnings];
}
