"use client";

import type { CompilePayload } from "@/src/lib/careos-types";
import { DriftFlag } from "@/src/components/DriftFlag";

type Props = {
  payload: CompilePayload | null;
  loading: boolean;
  residentLabel: string;
};

export function ShiftView({ payload, loading, residentLabel }: Props) {
  const result = payload?.result;
  return (
    <section className="shift-view" aria-live="polite">
      <header className="shift-header">
        <div>
          <p className="eyebrow">Shift handoff</p>
          <h2>{residentLabel}</h2>
        </div>
        <div className="status-pill">{loading ? "Compiling" : "Memory always on"}</div>
      </header>
      {payload?.verified === false ? (
        <div className="warning-badge unverified-hint">unverified citations removed from drift flags</div>
      ) : null}
      <div className="shift-grid">
        <article className="panel wide">
          <h3>Handoff summary</h3>
          <p>{result?.handoff_brief.summary ?? "Waiting for compile output."}</p>
        </article>
        <article className="panel">
          <h3>Watch items</h3>
          <ul>
            {result?.handoff_brief.watch_items.map((item, i) => <li key={`${i}-${item}`}>{item}</li>) ?? <li>Waiting</li>}
          </ul>
        </article>
        <article className="panel">
          <h3>Context the note missed</h3>
          <ul>
            {result?.handoff_brief.context_the_note_missed.length
              ? result.handoff_brief.context_the_note_missed.map((item, i) => <li key={`${i}-${item}`}>{item}</li>)
              : <li>No extra context surfaced.</li>}
          </ul>
        </article>
        <article className="panel wide">
          <h3>Observations</h3>
          <div className="stack">
            {result?.observations.map((obs, i) => (
              <div key={`${obs.note_id}-${i}`} className="observation">
                <span>{obs.category}</span>
                <p>{obs.text}</p>
              </div>
            )) ?? <p>Awaiting note input.</p>}
          </div>
        </article>
        <article className="panel wide scroller-panel">
          <h3>Resident memory</h3>
          <div className="memory-scroller">
            {["Baseline", "Communication cues", "Preferences", "Known triggers", "Calming approaches", "Family context", "Watch patterns"].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </article>
        <article className="panel">
          <h3>Warnings</h3>
          <div className="warning-badge">{payload?.warnings.length ? payload.warnings.join(" • ") : "No warnings"}</div>
        </article>
        <article className="panel">
          <h3>Compile source</h3>
          <p>{payload ? "Production compile response" : "Awaiting note input"}</p>
        </article>
        <article className="panel wide">
          <h3>Drift flags</h3>
          <div className="stack">
            {result?.drift_flags.length ? result.drift_flags.map((flag, i) => <DriftFlag key={`${flag.claim}-${i}`} flag={flag} />) : <p>No drift flags surfaced.</p>}
          </div>
        </article>
      </div>
    </section>
  );
}
