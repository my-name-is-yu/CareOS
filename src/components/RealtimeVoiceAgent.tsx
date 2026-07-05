"use client";

import { useEffect, useRef, useState } from "react";
import { RealtimeAgent, RealtimeSession, type RealtimeItem } from "@openai/agents-realtime";
import type { RealtimeClientSecretResponse } from "@/src/lib/realtime";

type VoiceState = "idle" | "connecting" | "connected" | "error";

type TranscriptMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

function messageText(item: RealtimeItem): TranscriptMessage | null {
  if (item.type !== "message" || (item.role !== "user" && item.role !== "assistant")) return null;
  const text = item.content
    .map((part) => {
      if (part.type === "input_text") return part.text;
      if (part.type === "input_audio") return part.transcript ?? "";
      if (part.type === "text") return part.text;
      if (part.type === "audio") return part.transcript ?? "";
      return "";
    })
    .filter(Boolean)
    .join(" ");

  if (!text.trim()) return null;
  return { id: item.itemId, role: item.role, text };
}

export function RealtimeVoiceAgent() {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [fallbackText, setFallbackText] = useState("");
  const sessionRef = useRef<RealtimeSession | null>(null);

  useEffect(() => {
    return () => sessionRef.current?.close();
  }, []);

  async function connect() {
    setError("");
    setVoiceState("connecting");
    try {
      if (!globalThis.navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone access is not available in this browser.");
      }

      const response = await globalThis.fetch("/api/realtime/session", { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not create realtime session.");
      }
      const { clientSecret } = (await response.json()) as RealtimeClientSecretResponse;
      const agent = new RealtimeAgent({
        name: "CareOS dementia-care nursing support",
        instructions: "Follow the server-provided CareOS resident-memory instructions for every turn.",
      });
      const session = new RealtimeSession(agent, {
        transport: "webrtc",
        model: "gpt-4o-realtime-preview-2025-06-03",
        config: {
          inputAudioTranscription: { model: "gpt-4o-mini-transcribe" },
          turnDetection: { type: "server_vad", createResponse: true, interruptResponse: true },
        },
      });

      session.on("history_updated", (history) => setMessages(history.map(messageText).filter((item): item is TranscriptMessage => item !== null)));
      session.on("error", ({ error: sessionError }) => {
        setError(sessionError instanceof Error ? sessionError.message : "Realtime session error.");
        setVoiceState("error");
      });

      await session.connect({ apiKey: clientSecret.value });
      sessionRef.current = session;
      setMuted(Boolean(session.muted));
      setVoiceState("connected");
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Microphone permission or connection failed.");
      setVoiceState("error");
    }
  }

  function disconnect() {
    sessionRef.current?.close();
    sessionRef.current = null;
    setMuted(false);
    setVoiceState("idle");
  }

  function toggleMute() {
    const next = !muted;
    sessionRef.current?.mute(next);
    setMuted(next);
  }

  function interrupt() {
    sessionRef.current?.interrupt();
  }

  function sendFallback() {
    const text = fallbackText.trim();
    if (!text || voiceState !== "connected") return;
    sessionRef.current?.sendMessage(text);
    setFallbackText("");
  }

  const connected = voiceState === "connected";

  return (
    <section className="voice-agent panel">
      <div className="voice-header">
        <div>
          <p className="eyebrow">Realtime care agent</p>
          <h2>Voice support</h2>
        </div>
        <span className={`connection-dot ${connected ? "connected" : ""}`}>{voiceState}</span>
      </div>

      <div className="input-actions">
        {connected ? (
          <button type="button" className="secondary" onClick={disconnect}>Disconnect</button>
        ) : (
          <button type="button" onClick={connect} disabled={voiceState === "connecting"}>
            {voiceState === "connecting" ? "Connecting..." : "Connect mic"}
          </button>
        )}
        <button type="button" className="secondary" onClick={toggleMute} disabled={!connected}>
          {muted ? "Unmute" : "Mute"}
        </button>
        <button type="button" className="secondary" onClick={interrupt} disabled={!connected}>
          Interrupt
        </button>
      </div>

      {error ? <p className="voice-error">{error}</p> : null}

      <div className="fallback-row">
        <input
          value={fallbackText}
          onChange={(event) => setFallbackText(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && sendFallback()}
          placeholder="Type a fallback message to the live agent."
          disabled={!connected}
        />
        <button type="button" onClick={sendFallback} disabled={!connected || !fallbackText.trim()}>
          Send
        </button>
      </div>

      <div className="voice-history" aria-live="polite">
        {messages.length === 0 ? (
          <p className="empty-history">No realtime transcript yet.</p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`voice-message ${message.role}`}>
              <span>{message.role}</span>
              <p>{message.text}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
