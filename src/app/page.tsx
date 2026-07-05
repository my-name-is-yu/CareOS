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

export default function HomePage() {
  const [resident, setResident] = useState<Resident>({
    name: "Aiko Mori",
    age: 84,
    room: "A-101",
    timezone: "Asia/Tokyo",
    language: "ja",
  });
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
      if (!response.ok) throw new Error("compile failed");
      setPayload((await response.json()) as CompilePayload);
    } catch {
      setError("Compile failed. Check server configuration and retry.");
    } finally {
      setLoading(false);
    }
  }

  const residentLabel = useMemo(() => `${resident.name} - Room ${resident.room}`, [resident]);
  const watchItems = payload?.result.handoff_brief.watch_items ?? memory.watch_patterns;

  return (
    <main className="app-shell">
      <section className="hero compact">
        <div>
          <p className="eyebrow">CareOS nursing workspace</p>
          <h1>{resident.name}</h1>
          <p className="lede">{resident.room} - {resident.language} - {resident.timezone}</p>
        </div>
        <div className="resident-card">
          <span>Today&apos;s watch</span>
          {watchItems.slice(0, 3).map((item) => (
            <strong key={item}>{item}</strong>
          ))}
        </div>
      </section>

      <section className="workspace">
        <div className="left-rail">
          <RealtimeVoiceAgent />
          <NoteInput loading={loading} onSubmit={submit} />
        </div>
        <div className="right-rail">
          {error ? <div className="warning-badge">{error}</div> : null}
          <ShiftView loading={loading} payload={payload} residentLabel={residentLabel} />
          <section className="patient-memory panel">
            <p className="eyebrow">Patient memory</p>
            <div className="memory-columns">
              <div>
                <h3>Care approach</h3>
                <ul>
                  {memory.communication_cues.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
                  {memory.calming_approaches.slice(0, 2).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <h3>Preferences and triggers</h3>
                <ul>
                  {memory.preferences.slice(0, 2).map((item) => <li key={item}>{item}</li>)}
                  {memory.known_triggers.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <h3>Recent changes</h3>
                <ul>
                  {memory.recent_history.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
