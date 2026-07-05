"use client";

import { useEffect, useMemo, useState } from "react";
import { ModeToggle } from "@/src/components/ModeToggle";
import { NoteInput } from "@/src/components/NoteInput";
import { ShiftView } from "@/src/components/ShiftView";
import type { CompilePayload, Resident } from "@/src/lib/careos-types";
import { defaultResident, fixtureOff, fixtureOn } from "@/src/lib/careos-fixtures";

export default function HomePage() {
  const [resident, setResident] = useState<Resident>(defaultResident);
  const [mode, setMode] = useState<"off" | "on">("off");
  const [loading, setLoading] = useState(false);
  const [offPayload, setOffPayload] = useState<CompilePayload | null>(fixtureOff);
  const [onPayload, setOnPayload] = useState<CompilePayload | null>(fixtureOn);
  const activePayload = mode === "on" ? onPayload : offPayload;

  useEffect(() => {
    globalThis.fetch("/api/resident")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Resident | null) => data && setResident(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onKeyDown(event: { key: string }) {
      if (event.key.toLowerCase() === "f") {
        if (mode === "off") {
          setOffPayload({ ...fixtureOff, cached: true });
          setMode("off");
        } else {
          setOnPayload({ ...fixtureOn, cached: true });
          setMode("on");
        }
      }
    }
    globalThis.window.addEventListener("keydown", onKeyDown);
    return () => globalThis.window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  async function submit(note: { note: string; transcript?: string }) {
    setLoading(true);
    let settled = 0;
    const finish = () => {
      settled += 1;
      if (settled === 2) setLoading(false);
    };
    const send = async (modeName: "off" | "on") => {
      try {
        const response = await globalThis.fetch("/api/compile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: note.note, mode: modeName, transcript: note.transcript })
        });
        if (!response.ok) throw new Error("compile failed");
        const payload = (await response.json()) as CompilePayload;
        if (modeName === "off") {
          setOffPayload(payload);
          setMode("off");
        } else {
          setOnPayload(payload);
        }
      } catch {
        if (modeName === "off") {
          setOffPayload({ ...fixtureOff, cached: true });
          setMode("off");
        } else {
          setOnPayload({ ...fixtureOn, cached: true });
        }
      } finally {
        finish();
      }
    };

    void send("off");
    void send("on");
  }

  const residentLabel = useMemo(() => `${resident.name} · Room ${resident.room}`, [resident]);

  return (
    <main className="app-shell">
      <section className="hero compact">
        <div>
          <p className="eyebrow">CareOS ops console</p>
          <h1>Typed note to resident shift memory</h1>
          <p className="lede">Live resident context, compiled note review, and cached fallback data in one operator-focused screen.</p>
        </div>
        <div className="resident-card">
          <span>Resident</span>
          <strong>{resident.name}</strong>
          <span>{residentLabel}</span>
          <span>{resident.baseline_traits.join(" • ")}</span>
        </div>
      </section>

      <section className="workspace">
        <NoteInput loading={loading} onSubmit={submit} />
        <div className="right-rail">
          <ModeToggle selectedMode={mode} onChange={setMode} />
          <ShiftView loading={loading} payload={activePayload} mode={mode} residentLabel={residentLabel} />
        </div>
      </section>
    </main>
  );
}
