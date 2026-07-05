"use client";

import type { ProfileCitation } from "@/src/lib/careos-types";

type Props = {
  citations: ProfileCitation[];
};

export function EvidenceList({ citations }: Props) {
  if (citations.length === 0) return null;

  return (
    <details className="evidence">
      <summary>Evidence ({citations.length})</summary>
      <div className="evidence-body">
        {citations.map((citation, i) => (
          <div key={`${citation.recordId}-${i}`} className="citation">
            <div className="citation-meta">record: {citation.recordId}</div>
            <blockquote>{citation.quote}</blockquote>
          </div>
        ))}
      </div>
    </details>
  );
}
