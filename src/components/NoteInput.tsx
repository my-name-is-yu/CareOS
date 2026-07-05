"use client";

/* eslint-disable no-unused-vars */

import { useRef, useState } from "react";
import type { NoteRequest } from "@/src/lib/careos-types";

type Props = {
  onSubmit: (note: NoteRequest) => void;
  loading: boolean;
};

export function NoteInput({ onSubmit, loading }: Props) {
  const [note, setNote] = useState("");
  const [transcript, setTranscript] = useState("");
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<any>(null);
  const chunksRef = useRef<any[]>([]);

  async function handleMic() {
    if (!globalThis.navigator.mediaDevices?.getUserMedia) return;
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    const stream = await globalThis.navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new globalThis.MediaRecorder(stream) as any;
    chunksRef.current = [];
    recorder.ondataavailable = (event: { data: any }) => chunksRef.current.push(event.data);
    recorder.onstop = async () => {
      setRecording(false);
      const blob = new globalThis.Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      const formData = new globalThis.FormData();
      formData.append("audio", blob, "note.webm");
      try {
        const response = await globalThis.fetch("/api/transcribe", { method: "POST", body: formData });
        if (response.ok) {
          const data = (await response.json()) as { text?: string };
          if (data.text) {
            setTranscript(data.text);
            setNote(data.text);
          }
        }
      } catch {
        // Demo mode falls back to typed note display when transcription is unavailable.
      }
      stream.getTracks().forEach((track) => track.stop());
    };
    mediaRecorderRef.current = recorder;
    setRecording(true);
    recorder.start();
    globalThis.setTimeout(() => recorder.state === "recording" && recorder.stop(), 4000);
  }

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
        <button type="button" className="secondary" onClick={handleMic}>
          {recording ? "Stop mic" : "Mic"}
        </button>
        <button type="button" onClick={() => onSubmit({ note })} disabled={loading || !note.trim()}>
          Send to compile
        </button>
      </div>
      <div className="transcript">
        <label>Transcript</label>
        <p>{transcript || "No transcript yet."}</p>
      </div>
    </section>
  );
}
