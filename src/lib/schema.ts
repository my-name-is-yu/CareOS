import { z } from "zod";

export const CategorySchema = z.enum([
  "gait",
  "sleep",
  "appetite",
  "agitation",
  "medication",
  "social",
  "other",
]);

export const SeveritySchema = z.enum(["watch", "attention"]);

export const CitationSchema = z.object({
  note_id: z.string().min(1),
  quote: z.string().min(1),
});

export const ObservationSchema = z.object({
  category: CategorySchema,
  text: z.string().min(1),
  note_id: z.string().min(1),
});

export const DriftFlagSchema = z.object({
  claim: z.string().min(1),
  severity: SeveritySchema,
  citations: z.array(CitationSchema),
});

export const HandoffBriefSchema = z.object({
  summary: z.string().min(1),
  watch_items: z.array(z.string().min(1)),
  context_the_note_missed: z.array(z.string().min(1)),
});

export const CompileResultSchema = z.object({
  observations: z.array(ObservationSchema),
  drift_flags: z.array(DriftFlagSchema),
  handoff_brief: HandoffBriefSchema,
});

export const ModeSchema = z.enum(["on", "off"]);

export const CompileEnvelopeSchema = z.object({
  result: CompileResultSchema,
  verified: z.boolean(),
  warnings: z.array(z.string()),
  latencyMs: z.number().nonnegative(),
  cached: z.boolean(),
});

export type Category = z.infer<typeof CategorySchema>;
export type Citation = z.infer<typeof CitationSchema>;
export type CompileResult = z.infer<typeof CompileResultSchema>;
export type CompileEnvelope = z.infer<typeof CompileEnvelopeSchema>;
export type Mode = z.infer<typeof ModeSchema>;
