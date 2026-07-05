import { Agent } from "@openai/agents";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

import type { Resident } from "./data";
import {
  CareRecommendationSchema,
  ProfileChangeSchema,
  ProfileCitationSchema,
  ProfileFieldNameSchema,
  TrendFlagSchema,
  type CareRecord,
  type LivingCareProfile,
  type ProfileFieldName,
} from "./schema";

export const ProposedChangeSchema = z.object({
  field: ProfileFieldNameSchema,
  after: z
    .string()
    .min(1)
    .describe(
      "JSON-encoded value for the field. personSummary/handoffBrief: a JSON string literal. " +
        "calmingApproaches/knownTriggers: a JSON array of strings. recentChanges: a JSON array of " +
        "{description, direction, citations}. careRecommendations: a JSON array of {situation, approach, citations}. " +
        "trendFlags: a JSON array of {claim, severity, citations}.",
    ),
  citations: z.array(ProfileCitationSchema),
  rationale: z.string().min(1),
});

export const ProposedChangesSchema = z.object({
  changes: z.array(ProposedChangeSchema),
});

export type ProposedChange = z.infer<typeof ProposedChangeSchema>;
export type ProposedChanges = z.infer<typeof ProposedChangesSchema>;

const fieldValueSchemas = {
  personSummary: z.string(),
  handoffBrief: z.string(),
  calmingApproaches: z.array(z.string()),
  knownTriggers: z.array(z.string()),
  recentChanges: z.array(ProfileChangeSchema),
  careRecommendations: z.array(CareRecommendationSchema),
  trendFlags: z.array(TrendFlagSchema),
} as const satisfies Record<ProfileFieldName, z.ZodTypeAny>;

/**
 * Parses and validates the JSON-encoded `after` value for a given profile field
 * against that field's expected value shape. Throws if the JSON is malformed or
 * the shape does not match.
 */
export function parseFieldValue(field: ProfileFieldName, json: string): unknown {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error(`Field "${field}" after-value is not valid JSON: ${json}`);
  }

  const schema = fieldValueSchemas[field];
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Field "${field}" after-value does not match the expected shape: ${result.error.message}`);
  }
  return result.data;
}

export type ProfileAgentInput = {
  resident: Resident;
  currentProfile: LivingCareProfile;
  newRecords: CareRecord[];
  allRecords: CareRecord[];
  gbrainContext?: string | null;
  extraInstruction?: string;
};

const profileReasoningInstructions = [
  "You maintain a Living Care Profile for a dementia care resident by proposing per-field updates from new care records.",
  "This is operational caregiving support only. Never diagnose, prescribe, or suggest medication or dosage changes.",
  "Your reasoning roles, in order:",
  "1. Long-term pattern extraction: look across all records (not just the new ones) to find durable patterns worth reflecting in the profile.",
  "2. Change detection: compare the new records against the current Living Care Profile and identify what is new, improved, worsened, or changed since the profile was last approved.",
  "3. Learn what calms and what triggers this resident, and keep calmingApproaches/knownTriggers current and specific.",
  "4. Care recommendation learning: capture 'what works' as concrete situation-to-approach pairs care staff can act on.",
  "5. Trend flag generation: surface operational watch-items or attention-items for staff to keep an eye on; never phrase these as diagnoses.",
  "Only propose a change to a field when the new records actually justify it. If nothing in the new records changes a field, do not include that field in the output.",
  "Every change must include citations that are verbatim quotes copied exactly (character for character) from a record's body field, paired with that record's id.",
  "For recentChanges, careRecommendations, and trendFlags, each individual item in the array must carry its own citations array with at least one verbatim quote.",
  "Do not fabricate or paraphrase quotes; if you cannot find a verbatim supporting quote, do not propose the change.",
  "Do not compute or return 'before' values yourself; the server fills those in from the current stored profile. Only return the new 'after' value.",
  "Encode 'after' as a JSON string (JSON.stringify'd) matching the target field's value shape:",
  "- personSummary, handoffBrief: a JSON string.",
  "- calmingApproaches, knownTriggers: a JSON array of strings.",
  "- recentChanges: a JSON array of objects {description, direction: 'new'|'improved'|'worsened'|'changed', citations: [{recordId, quote}]}.",
  "- careRecommendations: a JSON array of objects {situation, approach, citations: [{recordId, quote}]}.",
  "- trendFlags: a JSON array of objects {claim, severity: 'watch'|'attention', citations: [{recordId, quote}]}.",
  "When G-Brain patient knowledge context is supplied, treat it as authoritative long-term memory alongside the record list.",
].join("\n");

export const ProfileReasoningAgent = new Agent({
  name: "ProfileReasoningAgent",
  model: "gpt-4o",
  outputType: ProposedChangesSchema as never,
  instructions: profileReasoningInstructions,
});

export function assembleProfileAgentInput(input: ProfileAgentInput): string {
  return JSON.stringify(
    {
      resident: input.resident,
      current_profile: input.currentProfile,
      new_records: input.newRecords,
      all_records: input.allRecords,
      gbrain_knowledge_context: input.gbrainContext ?? null,
      output_contract:
        "Return ProposedChanges JSON with a `changes` array. Each change has field, after (JSON-encoded string matching " +
        "that field's value shape), citations (verbatim quotes with recordId), and rationale. Only include fields that " +
        "new records justify changing.",
      extra_instruction: input.extraInstruction ?? null,
    },
    null,
    2,
  );
}

export async function runProfileUpdateAgent(input: ProfileAgentInput): Promise<ProposedChanges> {
  const openai = new OpenAI({ apiKey: globalThis.process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.parse({
    model: "gpt-4o",
    messages: [
      { role: "system", content: profileReasoningInstructions },
      { role: "user", content: assembleProfileAgentInput(input) },
    ],
    response_format: zodResponseFormat(ProposedChangesSchema, "proposed_changes"),
  });
  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) {
    throw new Error("ProfileReasoningAgent returned no parsed output.");
  }
  return ProposedChangesSchema.parse(parsed);
}
