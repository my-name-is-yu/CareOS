"use client";

import { useEffect, useMemo, useState } from "react";
import { NoteInput } from "@/src/components/NoteInput";
import { ShiftView } from "@/src/components/ShiftView";
import type { CompilePayload, Resident } from "@/src/lib/careos-types";

const defaultResident: Resident = {
  name: "Default Resident",
  age: 84,
  room: "A-101",
  baseline_traits: ["slow gait", "prefers calm communication", "uses walker"],
  timezone: "Asia/Tokyo",
  language: "ja"
};

export default function HomePage() {
  const [resident, setResident] = useState<Resident>(defaultResident);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<CompilePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    globalThis.fetch("/api/resident")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { resident: Resident } | null) => data?.resident && setResident(data.resident))
      .catch(() => {});
  }, []);

  async function submit(note: { note: string }) {
    setLoading(true);
    setError(null);
    try {
      const response = await globalThis.fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.note })
      });
      if (!response.ok) throw new Error("Unable to compile handoff.");
      setPayload((await response.json()) as CompilePayload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to compile handoff.");
    } finally {
      setLoading(false);
    }
  }

  const residentLabel = useMemo(() => `${resident.name} · Room ${resident.room}`, [resident]);

  return (
    <main className="app-shell">
      <section className="patient-bar">
        <div>
          <p className="eyebrow">Current resident</p>
          <h1>{residentLabel}</h1>
        </div>
        <div className="patient-meta" aria-label="resident baseline">
          <span>{resident.age} years</span>
          <span>{resident.language.toUpperCase()}</span>
          <span>{resident.timezone}</span>
        </div>
      </section>

      <section className="workspace">
        <div className="main-column">
          <ShiftView loading={loading} payload={payload} resident={resident} error={error} />
          <NoteInput loading={loading} onSubmit={submit} />
        </div>
        <aside className="memory-rail" aria-label="patient memory">
          <div className="rail-section">
            <p className="eyebrow">Patient memory</p>
            <h2>{resident.name}</h2>
            <ul className="memory-list">
              {resident.baseline_traits.map((trait) => <li key={trait}>{trait}</li>)}
            </ul>
          </div>
          <div className="rail-section">
            <h3>Care approach</h3>
            <p>Keep communication calm, support walker use, and reduce corridor noise during care transitions.</p>
          </div>
          <div className="rail-section">
            <h3>Recent changes</h3>
            <ul className="memory-list">
              {(payload?.result.drift_flags.length
                ? payload.result.drift_flags.map((flag) => flag.claim)
                : ["Slower gait after lunch", "Medication refusal repeated", "Corridor noise sensitivity"]).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </aside>
      </section>
    </main>
  );
}
