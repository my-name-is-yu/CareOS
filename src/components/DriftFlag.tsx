"use client";

import { useState } from "react";
import type { DriftFlagData } from "@/src/lib/careos-types";

type Props = {
  flag: DriftFlagData;
};

export function DriftFlag({ flag }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <details className="drift-flag" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span>{flag.claim}</span>
        <strong>{flag.severity.toUpperCase()}</strong>
      </summary>
      <div className="drift-flag-body">
        {flag.citations.map((citation) => (
          <div key={`${citation.note_id}-${citation.quote}`} className="citation">
            <div className="citation-meta">note_id: {citation.note_id}</div>
            <blockquote>{citation.quote}</blockquote>
          </div>
        ))}
      </div>
    </details>
  );
}
