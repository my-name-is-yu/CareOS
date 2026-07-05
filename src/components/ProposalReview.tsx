"use client";

/* eslint-disable no-unused-vars */

import { useCallback, useEffect, useState } from "react";

import { EvidenceList } from "@/src/components/EvidenceList";
import type {
  CareRecommendation,
  FieldDiff,
  ProfileChange,
  ProfileFieldName,
  ProfileUpdateProposal,
  TrendFlag,
} from "@/src/lib/careos-types";

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

const statusLabels: Record<ProfileUpdateProposal["status"], string> = {
  proposed: "proposed",
  approved: "approved",
  rejected: "rejected",
  edited_and_approved: "approved with edits",
};

const directionOptions: ProfileChange["direction"][] = ["new", "improved", "worsened", "changed"];
const severityOptions: TrendFlag["severity"][] = ["watch", "attention"];

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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateFieldDiff(diff: FieldDiff): boolean {
  switch (diff.field) {
    case "personSummary":
    case "handoffBrief":
      return isNonEmptyString(diff.after);
    case "calmingApproaches":
    case "knownTriggers": {
      const list = diff.after;
      return Array.isArray(list) && list.every((item) => isNonEmptyString(item));
    }
    case "recentChanges": {
      const list = diff.after as ProfileChange[];
      return (
        Array.isArray(list) &&
        list.every((item) => isNonEmptyString(item?.description) && directionOptions.includes(item?.direction))
      );
    }
    case "careRecommendations": {
      const list = diff.after as CareRecommendation[];
      return (
        Array.isArray(list) && list.every((item) => isNonEmptyString(item?.situation) && isNonEmptyString(item?.approach))
      );
    }
    case "trendFlags": {
      const list = diff.after as TrendFlag[];
      return (
        Array.isArray(list) && list.every((item) => isNonEmptyString(item?.claim) && severityOptions.includes(item?.severity))
      );
    }
    default:
      return true;
  }
}

function StringFieldEditor({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return <textarea value={value} onChange={(e) => onChange(e.target.value)} />;
}

function StringListFieldEditor({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  function updateItem(index: number, next: string) {
    const copy = [...value];
    copy[index] = next;
    onChange(copy);
  }
  function removeItem(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }
  function addItem() {
    onChange([...value, ""]);
  }
  return (
    <div className="editable-list">
      {value.map((item, i) => (
        <div className="editable-list-row" key={i}>
          <input type="text" value={item} onChange={(e) => updateItem(i, e.target.value)} />
          <button type="button" className="secondary small" onClick={() => removeItem(i)}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="secondary small" onClick={addItem}>
        Add item
      </button>
    </div>
  );
}

function ChangeListFieldEditor({ value, onChange }: { value: ProfileChange[]; onChange: (next: ProfileChange[]) => void }) {
  function update(index: number, patch: Partial<ProfileChange>) {
    const copy = [...value];
    copy[index] = { ...copy[index], ...patch };
    onChange(copy);
  }
  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }
  return (
    <div className="editable-list">
      {value.map((item, i) => (
        <div className="editable-struct-row" key={i}>
          <select value={item.direction} onChange={(e) => update(i, { direction: e.target.value as ProfileChange["direction"] })}>
            {directionOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <textarea value={item.description} onChange={(e) => update(i, { description: e.target.value })} />
          <button type="button" className="secondary small" onClick={() => remove(i)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

function RecommendationListFieldEditor({
  value,
  onChange,
}: {
  value: CareRecommendation[];
  onChange: (next: CareRecommendation[]) => void;
}) {
  function update(index: number, patch: Partial<CareRecommendation>) {
    const copy = [...value];
    copy[index] = { ...copy[index], ...patch };
    onChange(copy);
  }
  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }
  return (
    <div className="editable-list">
      {value.map((item, i) => (
        <div className="editable-struct-row" key={i}>
          <input type="text" value={item.situation} onChange={(e) => update(i, { situation: e.target.value })} />
          <textarea value={item.approach} onChange={(e) => update(i, { approach: e.target.value })} />
          <button type="button" className="secondary small" onClick={() => remove(i)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

function TrendFlagListFieldEditor({ value, onChange }: { value: TrendFlag[]; onChange: (next: TrendFlag[]) => void }) {
  function update(index: number, patch: Partial<TrendFlag>) {
    const copy = [...value];
    copy[index] = { ...copy[index], ...patch };
    onChange(copy);
  }
  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }
  return (
    <div className="editable-list">
      {value.map((item, i) => (
        <div className="editable-struct-row" key={i}>
          <select value={item.severity} onChange={(e) => update(i, { severity: e.target.value as TrendFlag["severity"] })}>
            {severityOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <textarea value={item.claim} onChange={(e) => update(i, { claim: e.target.value })} />
          <button type="button" className="secondary small" onClick={() => remove(i)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

function FieldEditor({ diff, onChange }: { diff: FieldDiff; onChange: (next: unknown) => void }) {
  switch (diff.field) {
    case "personSummary":
    case "handoffBrief":
      return <StringFieldEditor value={diff.after as string} onChange={onChange} />;
    case "calmingApproaches":
    case "knownTriggers":
      return <StringListFieldEditor value={diff.after as string[]} onChange={onChange} />;
    case "recentChanges":
      return <ChangeListFieldEditor value={diff.after as ProfileChange[]} onChange={onChange} />;
    case "careRecommendations":
      return <RecommendationListFieldEditor value={diff.after as CareRecommendation[]} onChange={onChange} />;
    case "trendFlags":
      return <TrendFlagListFieldEditor value={diff.after as TrendFlag[]} onChange={onChange} />;
    default:
      return null;
  }
}

function FieldDiffCard({
  diff,
  isEditing,
  onToggleEdit,
  onChange,
}: {
  diff: FieldDiff;
  isEditing: boolean;
  onToggleEdit: () => void;
  onChange: (next: FieldDiff) => void;
}) {
  const valid = validateFieldDiff(diff);
  return (
    <div className="field-diff">
      <div className="field-diff-header">
        <h4>{fieldLabels[diff.field]}</h4>
        <button type="button" className="secondary small" onClick={onToggleEdit}>
          {isEditing ? "Done editing" : "Edit"}
        </button>
      </div>
      {isEditing ? (
        <>
          <FieldEditor diff={diff} onChange={(after) => onChange({ ...diff, after })} />
          {!valid ? <p className="muted-line error-line">Every item needs text before this can be approved.</p> : null}
          <p className="muted-line edit-hint">
            Citations are carried over unchanged from the original, already-verified proposal and cannot be edited here.
          </p>
        </>
      ) : (
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
      )}
      <p className="muted-line">{diff.rationale}</p>
      <EvidenceList citations={diff.citations} />
    </div>
  );
}

export function ProposalReview({ refreshToken, onApproved }: Props) {
  const [proposals, setProposals] = useState<ProfileUpdateProposal[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workingChanges, setWorkingChanges] = useState<Record<string, FieldDiff[]>>({});
  const [editingKeys, setEditingKeys] = useState<Record<string, boolean>>({});

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

  useEffect(() => {
    setWorkingChanges((previous) => {
      const next: Record<string, FieldDiff[]> = {};
      for (const proposal of proposals) {
        if (proposal.status === "proposed") {
          next[proposal.id] = previous[proposal.id] ?? proposal.changes.map((diff) => ({ ...diff }));
        }
      }
      return next;
    });
  }, [proposals]);

  function changesFor(proposal: ProfileUpdateProposal): FieldDiff[] {
    return workingChanges[proposal.id] ?? proposal.changes;
  }

  function isModified(proposal: ProfileUpdateProposal): boolean {
    return JSON.stringify(changesFor(proposal)) !== JSON.stringify(proposal.changes);
  }

  function isValid(proposal: ProfileUpdateProposal): boolean {
    return changesFor(proposal).every((diff) => validateFieldDiff(diff));
  }

  function updateDiff(proposalId: string, index: number, next: FieldDiff) {
    setWorkingChanges((previous) => {
      const current = previous[proposalId] ?? [];
      const copy = [...current];
      copy[index] = next;
      return { ...previous, [proposalId]: copy };
    });
  }

  function toggleEditing(proposalId: string, index: number) {
    const key = `${proposalId}:${index}`;
    setEditingKeys((previous) => ({ ...previous, [key]: !previous[key] }));
  }

  async function approve(proposal: ProfileUpdateProposal) {
    setBusyId(proposal.id);
    setError(null);
    try {
      const modified = isModified(proposal);
      const body = modified ? { approvedBy: "nurse", editedChanges: changesFor(proposal) } : {};
      const response = await globalThis.fetch(`/api/proposals/${proposal.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
          {pending.map((proposal) => {
            const changes = changesFor(proposal);
            const modified = isModified(proposal);
            const valid = isValid(proposal);
            return (
              <div key={proposal.id} className="proposal-card">
                <div className="proposal-header">
                  <span>{proposal.id}</span>
                  <span className="muted-line">
                    base v{proposal.baseVersion} - {new Date(proposal.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="stack">
                  {changes.map((diff, i) => (
                    <FieldDiffCard
                      key={`${diff.field}-${i}`}
                      diff={diff}
                      isEditing={Boolean(editingKeys[`${proposal.id}:${i}`])}
                      onToggleEdit={() => toggleEditing(proposal.id, i)}
                      onChange={(next) => updateDiff(proposal.id, i, next)}
                    />
                  ))}
                </div>
                {!valid ? <p className="muted-line error-line">Fix the empty fields above before approving.</p> : null}
                <div className="input-actions">
                  <button
                    type="button"
                    onClick={() => approve(proposal)}
                    disabled={busyId === proposal.id || !valid}
                  >
                    {busyId === proposal.id ? "Approving..." : modified ? "Approve with edits" : "Approve"}
                  </button>
                  <button type="button" className="secondary" onClick={() => reject(proposal.id)} disabled={busyId === proposal.id}>
                    Reject
                  </button>
                </div>
              </div>
            );
          })}
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
                  <span className={`status-badge status-${proposal.status}`}>{statusLabels[proposal.status]}</span>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
