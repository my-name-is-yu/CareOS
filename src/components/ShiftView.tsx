"use client";

import type { CompilePayload, PatientMemory, Resident } from "@/src/lib/careos-types";
import { DriftFlag } from "@/src/components/DriftFlag";

type Props = {
  payload: CompilePayload | null;
  loading: boolean;
  resident: Resident;
  memory: PatientMemory;
  error: string | null;
};

export function ShiftView({ payload, loading, resident, memory, error }: Props) {
  const result = payload?.result;
  const watchItems = result?.handoff_brief.watch_items.length
    ? result.handoff_brief.watch_items
    : memory.watch_patterns.slice(0, 3);
  const recentChanges = result?.handoff_brief.context_the_note_missed.length
    ? result.handoff_brief.context_the_note_missed
    : memory.recent_history.slice(0, 3);

  return (
    <section className="shift-view" aria-live="polite">
      <header className="shift-header">
        <div>
          <p className="eyebrow">Nurse workspace</p>
          <h2>Today&apos;s care plan</h2>
        </div>
        <div className="status-pill">{loading ? "Compiling" : "Memory active"}</div>
      </header>
      {error ? <div className="warning-badge unverified-hint">{error}</div> : null}
      {payload?.verified === false ? <div className="warning-badge unverified-hint">Review citations before handoff.</div> : null}
      <div className="shift-grid">
        <article className="panel patient-summary">
          <h3>Current patient</h3>
          <p>{resident.name}, {resident.age}, room {resident.room}</p>
          <p className="muted-line">{memory.baseline.slice(0, 2).join(" / ")}</p>
        </article>
        <article className="panel">
          <h3>Today&apos;s watch items</h3>
          <ul>
            {watchItems.map((item, i) => <li key={`${i}-${item}`}>{item}</li>)}
          </ul>
        </article>
        <article className="panel">
          <h3>Recent changes</h3>
          <ul>
            {recentChanges.map((item, i) => <li key={`${i}-${item}`}>{item}</li>)}
          </ul>
        </article>
        <article className="panel">
          <h3>Care approach</h3>
          <ul>
            {memory.communication_cues.slice(0, 2).map((item) => <li key={item}>{item}</li>)}
            {memory.calming_approaches.slice(0, 1).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>
        <article className="panel wide">
          <h3>Observation output</h3>
          <div className="stack">
            {result?.observations.map((obs, i) => (
              <div key={`${obs.note_id}-${i}`} className="observation">
                <span>{obs.category}</span>
                <p>{obs.text}</p>
              </div>
            )) ?? <p className="muted-line">Submit an observation note to populate structured output.</p>}
          </div>
        </article>
        <article className="panel wide">
          <h3>Handoff draft</h3>
          <p>{result?.handoff_brief.summary ?? "Submit the current shift note to generate a resident-specific handoff draft."}</p>
          {payload?.warnings.length ? <div className="warning-badge inline-warning">{payload.warnings.join(" / ")}</div> : null}
        </article>
        <article className="panel wide">
          <h3>Attention flags</h3>
          <div className="stack">
            {result?.drift_flags.length
              ? result.drift_flags.map((flag, i) => <DriftFlag key={`${flag.claim}-${i}`} flag={flag} />)
              : <p className="muted-line">No new attention flags from the latest note.</p>}
          </div>
        </article>
      </div>
    </section>
  );
}
