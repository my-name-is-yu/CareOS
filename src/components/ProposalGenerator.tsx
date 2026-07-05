"use client";

/* eslint-disable no-unused-vars */

import { useState } from "react";
import type { ProfileUpdateProposal } from "@/src/lib/careos-types";

type Props = {
  onGenerated: (proposal: ProfileUpdateProposal | null) => void;
};

type GenerateResponse = {
  proposal?: ProfileUpdateProposal | null;
  warnings?: string[];
  error?: string;
};

export function ProposalGenerator({ onGenerated }: Props) {
  const [loading, setLoading] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"generated" | "none" | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setWarnings([]);
    setStatus(null);
    try {
      const response = await globalThis.fetch("/api/proposals/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json().catch(() => ({}))) as GenerateResponse;
      if (!response.ok) throw new Error(data.error ?? "Unable to generate proposal.");
      setWarnings(data.warnings ?? []);
      setStatus(data.proposal ? "generated" : "none");
      onGenerated(data.proposal ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate proposal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel proposal-generator">
      <p className="eyebrow">Profile update</p>
      <p className="muted-line">Generate a reviewable profile-update proposal from new care records since the last approval.</p>
      <div className="input-actions">
        <button type="button" onClick={generate} disabled={loading}>
          {loading ? "Generating..." : "Generate profile update proposal"}
        </button>
      </div>
      {error ? <p className="muted-line error-line">{error}</p> : null}
      {status === "none" && !error ? <p className="muted-line">No proposal-worthy changes found.</p> : null}
      {warnings.length ? <div className="warning-badge inline-warning">{warnings.join(" / ")}</div> : null}
      {status === "generated" ? <p className="muted-line success-line">Proposal created. Review it below.</p> : null}
    </section>
  );
}
