"use client";

import { useEffect, useRef, useState } from "react";
import { RealtimeAgent, RealtimeSession, type RealtimeItem } from "@openai/agents-realtime";
import { realtimeModel, realtimeWebRtcUrl, type RealtimeClientSecretResponse } from "@/src/lib/realtime";
import { ShaderOrb, type ShaderOrbTheme } from "@/src/components/ShaderOrb";

type VoiceState = "idle" | "connecting" | "connected" | "error";

type TranscriptMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type Props = {
  residentId: string;
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

function realtimeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Microphone permission or connection failed.";
  if (error.message.includes("Expect line: v=")) {
    return "Realtime connection failed before audio negotiation. Check the session endpoint, model, and server API key.";
  }
  return error.message;
}

const statusLabel: Record<VoiceState, string> = {
  idle: "Tap to start voice support",
  connecting: "Connecting...",
  connected: "Listening",
  error: "Connection failed",
};

export function RealtimeVoiceAgent({ residentId }: Props) {
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

      const response = await globalThis.fetch(`/api/realtime/session?residentId=${encodeURIComponent(residentId)}`, {
        method: "POST",
      });
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
        model: realtimeModel,
        config: {
          inputAudioTranscription: { model: "gpt-4o-mini-transcribe" },
          turnDetection: { type: "server_vad", createResponse: true, interruptResponse: true },
        },
      });

      session.on("history_updated", (history) => setMessages(history.map(messageText).filter((item): item is TranscriptMessage => item !== null)));
      session.on("error", ({ error: sessionError }) => {
        setError(realtimeErrorMessage(sessionError));
        setVoiceState("error");
      });

      await session.connect({ apiKey: clientSecret.value, url: realtimeWebRtcUrl });
      sessionRef.current = session;
      setMuted(Boolean(session.muted));
      setVoiceState("connected");
    } catch (connectError) {
      setError(realtimeErrorMessage(connectError));
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
  const connecting = voiceState === "connecting";

  function handleOrbClick() {
    if (connected || connecting) {
      disconnect();
    } else {
      connect();
    }
  }

  const orbTheme: ShaderOrbTheme =
    voiceState === "connected"
      ? "orange"
      : voiceState === "connecting"
        ? "purple"
        : voiceState === "error"
          ? "crimson"
          : "blue";

  return (
    <section className="voice-agent panel">
      <div className="voice-orb-wrap">
        <button
          type="button"
          className={`voice-orb ${connected ? "connected" : ""} ${connecting ? "connecting" : ""} ${voiceState === "error" ? "errored" : ""}`}
          onClick={handleOrbClick}
          disabled={connecting}
          aria-pressed={connected}
          aria-label={connected ? "Disconnect voice support" : "Connect voice support"}
        >
          <ShaderOrb size={96} theme={orbTheme} />
          <span className="voice-orb-icon" aria-hidden="true">
            {connected ? "◉" : "🎙"}
          </span>
        </button>
        <p className="voice-status-text">{statusLabel[voiceState]}</p>
      </div>

      <div className="voice-controls-row">
        <button type="button" className="secondary small" onClick={toggleMute} disabled={!connected}>
          {muted ? "Unmute" : "Mute"}
        </button>
        <button type="button" className="secondary small" onClick={interrupt} disabled={!connected}>
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
