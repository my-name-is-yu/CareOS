"use client";

/* eslint-disable no-unused-vars */

import { useState } from "react";
import type { NoteRequest } from "@/src/lib/careos-types";

type Props = {
  onSubmit: (note: NoteRequest) => void;
  loading: boolean;
};

export function NoteInput({ onSubmit, loading }: Props) {
  const [note, setNote] = useState("");

  return (
    <section className="note-input panel">
      <p className="eyebrow">Typed note path</p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Write the resident note here."
        rows={7}
      />
      <div className="input-actions">
        <button type="button" onClick={() => onSubmit({ note })} disabled={loading || !note.trim()}>
          Send to compile
        </button>
      </div>
    </section>
  );
}
