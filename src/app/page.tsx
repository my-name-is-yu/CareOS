"use client";

import { useEffect, useMemo, useState } from "react";
import { NoteInput } from "@/src/components/NoteInput";
import { ShiftView } from "@/src/components/ShiftView";
import type { CompilePayload, Resident } from "@/src/lib/careos-types";

export default function HomePage() {
  const [resident, setResident] = useState<Resident>({
    name: "Aiko Mori",
    age: 84,
    room: "A-101",
    timezone: "Asia/Tokyo",
    language: "ja"
  });
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
      if (!response.ok) throw new Error("compile failed");
      setPayload((await response.json()) as CompilePayload);
    } catch {
      setError("Compile failed. Check server configuration and retry.");
    } finally {
      setLoading(false);
    }
  }

  const residentLabel = useMemo(() => `${resident.name} · Room ${resident.room}`, [resident]);

  return (
    <main className="app-shell">
      <section className="hero compact">
        <div>
          <p className="eyebrow">CareOS ops console</p>
          <h1>Typed note to resident shift memory</h1>
          <p className="lede">Live resident context, compiled note review, and patient memory in one operator-focused screen.</p>
        </div>
        <div className="resident-card">
          <span>Resident</span>
          <strong>{resident.name}</strong>
          <span>{residentLabel}</span>
          <span>{resident.language} · {resident.timezone}</span>
        </div>
      </section>

      <section className="workspace">
        <NoteInput loading={loading} onSubmit={submit} />
        <div className="right-rail">
          {error ? <div className="warning-badge">{error}</div> : null}
          <ShiftView loading={loading} payload={payload} residentLabel={residentLabel} />
        </div>
      </section>
    </main>
  );
}
