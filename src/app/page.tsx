"use client";

import { useEffect, useMemo, useState } from "react";
import { NoteInput } from "@/src/components/NoteInput";
import { RealtimeVoiceAgent } from "@/src/components/RealtimeVoiceAgent";
import { ShiftView } from "@/src/components/ShiftView";
import type { CompilePayload, PatientMemory, Resident } from "@/src/lib/careos-types";

const emptyMemory: PatientMemory = {
  baseline: [],
  communication_cues: [],
  preferences: [],
  known_triggers: [],
  calming_approaches: [],
  family_context_notes: [],
  recent_history: [],
  watch_patterns: [],
};

const defaultResident: Resident = {
  name: "Aiko Mori",
  age: 84,
  room: "A-101",
  timezone: "Asia/Tokyo",
  language: "ja",
};

export default function HomePage() {
  const [resident, setResident] = useState<Resident>(defaultResident);
  const [memory, setMemory] = useState<PatientMemory>(emptyMemory);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<CompilePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    globalThis.fetch("/api/resident")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { resident?: Resident; memory?: PatientMemory } | null) => {
        if (data?.resident) setResident(data.resident);
        if (data?.memory) setMemory(data.memory);
      })
      .catch(() => {});
  }, []);

  async function submit(note: { note: string }) {
    setLoading(true);
    setError(null);
    try {
      const response = await globalThis.fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.note }),
      });
      if (!response.ok) throw new Error("Unable to compile handoff.");
      setPayload((await response.json()) as CompilePayload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to compile handoff.");
    } finally {
      setLoading(false);
    }
  }

  const residentLabel = useMemo(() => `${resident.name} - Room ${resident.room}`, [resident]);
  const watchItems = payload?.result.handoff_brief.watch_items.length
    ? payload.result.handoff_brief.watch_items
    : memory.watch_patterns;

  return (
    <main className="app-shell">
      <section className="patient-bar">
        <div>
          <p className="eyebrow">Current resident</p>
          <h1>{residentLabel}</h1>
        </div>
        <div className="patient-meta" aria-label="resident details">
          <span>{resident.age} years</span>
          <span>{resident.language.toUpperCase()}</span>
          <span>{resident.timezone}</span>
        </div>
      </section>

      <section className="workspace">
        <div className="left-rail">
          <RealtimeVoiceAgent />
          <NoteInput loading={loading} onSubmit={submit} />
        </div>
        <div className="main-column">
          <ShiftView loading={loading} payload={payload} resident={resident} memory={memory} error={error} />
        </div>
        <aside className="memory-rail" aria-label="patient memory">
          <div className="rail-section">
            <p className="eyebrow">Patient memory</p>
            <h2>{resident.name}</h2>
            <ul className="memory-list">
              {memory.baseline.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className="rail-section">
            <h3>Care approach</h3>
            <ul className="memory-list">
              {memory.communication_cues.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
              {memory.calming_approaches.slice(0, 2).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className="rail-section">
            <h3>Preferences and triggers</h3>
            <ul className="memory-list">
              {memory.preferences.slice(0, 2).map((item) => <li key={item}>{item}</li>)}
              {memory.known_triggers.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className="rail-section">
            <h3>Today&apos;s watch</h3>
            <ul className="memory-list">
              {watchItems.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </aside>
      </section>
    </main>
  );
}
