"use client";

import { EvidenceList } from "@/src/components/EvidenceList";
import type { TrendFlag } from "@/src/lib/careos-types";

type Props = {
  flag: TrendFlag;
};

export function TrendFlagCard({ flag }: Props) {
  return (
    <div className={`trend-flag severity-${flag.severity}`}>
      <div className="trend-flag-header">
        <span>{flag.claim}</span>
        <strong>{flag.severity.toUpperCase()}</strong>
      </div>
      <EvidenceList citations={flag.citations} />
    </div>
  );
}
