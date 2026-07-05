import { z } from "zod";

// ---------------------------------------------------------------------------
// MemoryPath: multi-source care records + Living Care Profile
// ---------------------------------------------------------------------------

export const RecordTypeSchema = z.enum([
  "soap_note",
  "nurse_observation",
  "family_memory",
  "medication_record",
  "incident_report",
]);

export const CareRecordSchema = z.object({
  id: z.string().min(1),
  residentId: z.string().min(1),
  type: RecordTypeSchema,
  occurredAt: z.string().datetime(),
  author: z.object({
    role: z.string().min(1),
    name: z.string().optional(),
  }),
  body: z.string().min(1),
  legacyNoteId: z.string().optional(),
});

export const ProfileCitationSchema = z.object({
  recordId: z.string().min(1),
  quote: z.string().min(1),
});

export const ProfileStringFieldSchema = z.object({
  value: z.string(),
  citations: z.array(ProfileCitationSchema),
  updatedInVersion: z.number().int(),
});

export const ProfileStringListFieldSchema = z.object({
  value: z.array(z.string()),
  citations: z.array(ProfileCitationSchema),
  updatedInVersion: z.number().int(),
});

export const ProfileChangeSchema = z.object({
  description: z.string().min(1),
  direction: z.enum(["new", "improved", "worsened", "changed"]),
  citations: z.array(ProfileCitationSchema),
});

export const ProfileChangeListFieldSchema = z.object({
  value: z.array(ProfileChangeSchema),
  citations: z.array(ProfileCitationSchema),
  updatedInVersion: z.number().int(),
});

export const CareRecommendationSchema = z.object({
  situation: z.string().min(1),
  approach: z.string().min(1),
  citations: z.array(ProfileCitationSchema),
});

export const CareRecommendationListFieldSchema = z.object({
  value: z.array(CareRecommendationSchema),
  citations: z.array(ProfileCitationSchema),
  updatedInVersion: z.number().int(),
});

export const TrendFlagSchema = z.object({
  claim: z.string().min(1),
  severity: z.enum(["watch", "attention"]),
  citations: z.array(ProfileCitationSchema),
});

export const TrendFlagListFieldSchema = z.object({
  value: z.array(TrendFlagSchema),
  citations: z.array(ProfileCitationSchema),
  updatedInVersion: z.number().int(),
});

export const LivingCareProfileSchema = z.object({
  residentId: z.string().min(1),
  version: z.number().int().min(1),
  approvedBy: z.string(),
  approvedAt: z.string(),
  personSummary: ProfileStringFieldSchema,
  recentChanges: ProfileChangeListFieldSchema,
  calmingApproaches: ProfileStringListFieldSchema,
  knownTriggers: ProfileStringListFieldSchema,
  careRecommendations: CareRecommendationListFieldSchema,
  handoffBrief: ProfileStringFieldSchema,
  trendFlags: TrendFlagListFieldSchema,
});

export const ProfileFieldNameSchema = z.enum([
  "personSummary",
  "recentChanges",
  "calmingApproaches",
  "knownTriggers",
  "careRecommendations",
  "handoffBrief",
  "trendFlags",
]);

export const FieldDiffSchema = z.object({
  field: ProfileFieldNameSchema,
  before: z.unknown(),
  after: z.unknown(),
  citations: z.array(ProfileCitationSchema),
  rationale: z.string().min(1),
});

export const ProfileUpdateProposalSchema = z.object({
  id: z.string().min(1),
  residentId: z.string().min(1),
  baseVersion: z.number().int(),
  triggeredBy: z.array(z.string()),
  createdAt: z.string(),
  changes: z.array(FieldDiffSchema).min(1),
  status: z.enum(["proposed", "approved", "rejected", "edited_and_approved"]),
});

export type RecordType = z.infer<typeof RecordTypeSchema>;
export type CareRecord = z.infer<typeof CareRecordSchema>;
export type ProfileCitation = z.infer<typeof ProfileCitationSchema>;
export type ProfileStringField = z.infer<typeof ProfileStringFieldSchema>;
export type ProfileStringListField = z.infer<typeof ProfileStringListFieldSchema>;
export type ProfileChange = z.infer<typeof ProfileChangeSchema>;
export type ProfileChangeListField = z.infer<typeof ProfileChangeListFieldSchema>;
export type CareRecommendation = z.infer<typeof CareRecommendationSchema>;
export type CareRecommendationListField = z.infer<typeof CareRecommendationListFieldSchema>;
export type TrendFlag = z.infer<typeof TrendFlagSchema>;
export type TrendFlagListField = z.infer<typeof TrendFlagListFieldSchema>;
export type LivingCareProfile = z.infer<typeof LivingCareProfileSchema>;
export type ProfileFieldName = z.infer<typeof ProfileFieldNameSchema>;
export type FieldDiff = z.infer<typeof FieldDiffSchema>;
export type ProfileUpdateProposal = z.infer<typeof ProfileUpdateProposalSchema>;
