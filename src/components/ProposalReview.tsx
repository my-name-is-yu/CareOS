"use client";

import { useCallback, useEffect, useState } from "react";

import { EvidenceList } from "@/src/components/EvidenceList";
import type { FieldDiff, ProfileFieldName, ProfileUpdateProposal } from "@/src/lib/careos-types";

type Props = {
  refreshToken: number;
  onApproved: () => void;
};

const fieldLabels: Record<ProfileFieldName, string> = {
  personSummary: "Person summary",
  recentChanges: "Recent changes",
  calmingApproaches: "Calming approaches",
  knownTriggers: "Known triggers",
  careRecommendations: "Care recommendations",
  handoffBrief: "Handoff brief",
  trendFlags: "Trend flags",
};

function renderValue(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") return value ? [value] : [];
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        if ("description" in record && "direction" in record) {
          return `[${String(record.direction)}] ${String(record.description)}`;
        }
        if ("situation" in record && "approach" in record) {
          return `${String(record.situation)} -> ${String(record.approach)}`;
        }
        if ("claim" in record && "severity" in record) {
          return `[${String(record.severity)}] ${String(record.claim)}`;
        }
      }
      return JSON.stringify(item);
    });
  }
  return [JSON.stringify(value)];
}

function DiffValue({ value }: { value: unknown }) {
  const lines = renderValue(value);
  if (lines.length === 0) return <p className="muted-line">(empty)</p>;
  return (
    <ul>
      {lines.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  );
}

function FieldDiffCard({ diff }: { diff: FieldDiff }) {
  return (
    <div className="field-diff">
      <h4>{fieldLabels[diff.field]}</h4>
      <div className="diff-grid">
        <div>
          <p className="diff-label">Before</p>
          <DiffValue value={diff.before} />
        </div>
        <div>
          <p className="diff-label">After</p>
          <DiffValue value={diff.after} />
        </div>
      </div>
      <p className="muted-line">{diff.rationale}</p>
      <EvidenceList citations={diff.citations} />
    </div>
  );
}

export function ProposalReview({ refreshToken, onApproved }: Props) {
  const [proposals, setProposals] = useState<ProfileUpdateProposal[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    globalThis
      .fetch("/api/proposals")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { proposals?: ProfileUpdateProposal[] } | null) => {
        if (data?.proposals) setProposals(data.proposals);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, refreshToken]);

  async function approve(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const response = await globalThis.fetch(`/api/proposals/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Unable to approve proposal.");
      refresh();
      onApproved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to approve proposal.");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const response = await globalThis.fetch(`/api/proposals/${id}/reject`, { method: "POST" });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Unable to reject proposal.");
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to reject proposal.");
    } finally {
      setBusyId(null);
    }
  }

  const pending = proposals.filter((proposal) => proposal.status === "proposed");
  const resolved = proposals.filter((proposal) => proposal.status !== "proposed");

  return (
    <section className="panel proposal-review">
      <p className="eyebrow">Review and approve</p>
      <h2>Profile update proposals</h2>
      {error ? <p className="muted-line error-line">{error}</p> : null}
      {pending.length === 0 ? (
        <p className="muted-line">No proposals waiting for review.</p>
      ) : (
        <div className="stack">
          {pending.map((proposal) => (
            <div key={proposal.id} className="proposal-card">
              <div className="proposal-header">
                <span>{proposal.id}</span>
                <span className="muted-line">
                  base v{proposal.baseVersion} - {new Date(proposal.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="stack">
                {proposal.changes.map((diff, i) => (
                  <FieldDiffCard key={`${diff.field}-${i}`} diff={diff} />
                ))}
              </div>
              <div className="input-actions">
                <button type="button" onClick={() => approve(proposal.id)} disabled={busyId === proposal.id}>
                  {busyId === proposal.id ? "Approving..." : "Approve"}
                </button>
                <button type="button" className="secondary" onClick={() => reject(proposal.id)} disabled={busyId === proposal.id}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {resolved.length > 0 ? (
        <details className="resolved-proposals">
          <summary>Resolved proposals ({resolved.length})</summary>
          <div className="stack">
            {resolved.map((proposal) => (
              <div key={proposal.id} className="proposal-card resolved">
                <div className="proposal-header">
                  <span>{proposal.id}</span>
                  <span className={`status-badge status-${proposal.status}`}>{proposal.status.replace(/_/g, " ")}</span>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
