"use client";

/* eslint-disable no-unused-vars */

import { useState } from "react";
import type { CareRecord, RecordType } from "@/src/lib/careos-types";

type Props = {
  onCreated: (record: CareRecord) => void;
};

const recordTypeOptions: Array<{ value: RecordType; label: string }> = [
  { value: "soap_note", label: "SOAP Note" },
  { value: "nurse_observation", label: "Nurse Observation" },
  { value: "family_memory", label: "Family Memory" },
  { value: "medication_record", label: "Medication Record" },
  { value: "incident_report", label: "Incident Report" },
];

export function RecordInput({ onCreated }: Props) {
  const [type, setType] = useState<RecordType>("nurse_observation");
  const [body, setBody] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const response = await globalThis.fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          body,
          author: authorName.trim() ? { role: "nurse", name: authorName.trim() } : undefined,
        }),
      });
      if (!response.ok) throw new Error("Unable to add care record.");
      const data = (await response.json()) as { record: CareRecord };
      onCreated(data.record);
      setBody("");
      setAuthorName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add care record.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="record-input panel">
      <p className="eyebrow">Add care record</p>
      <select value={type} onChange={(e) => setType(e.target.value as RecordType)}>
        {recordTypeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Describe the observation, memory, medication event, or incident."
        rows={5}
      />
      <input
        type="text"
        value={authorName}
        onChange={(e) => setAuthorName(e.target.value)}
        placeholder="Author name (optional)"
      />
      <div className="input-actions">
        <button type="button" onClick={submit} disabled={loading || !body.trim()}>
          Add record
        </button>
      </div>
      {error ? <p className="muted-line">{error}</p> : null}
    </section>
  );
}
