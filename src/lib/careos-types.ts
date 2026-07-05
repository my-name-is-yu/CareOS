import type { Resident } from "./data";
import type {
  CareRecommendation,
  CareRecord,
  FieldDiff,
  LivingCareProfile,
  ProfileChange,
  ProfileCitation,
  ProfileFieldName,
  ProfileUpdateProposal,
  RecordType,
  TrendFlag,
} from "./schema";

export type {
  Resident,
  CareRecord,
  RecordType,
  LivingCareProfile,
  ProfileFieldName,
  ProfileCitation,
  ProfileChange,
  CareRecommendation,
  TrendFlag,
  FieldDiff,
  ProfileUpdateProposal,
};

export type ResidentEnvelope = {
  resident: Resident;
  profile: LivingCareProfile | null;
  recentRecords: CareRecord[];
};
