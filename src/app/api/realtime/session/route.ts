import { NextResponse } from "next/server";
import OpenAI from "openai";

import { loadHistory, loadResident } from "../../../../lib/data";
import { buildRealtimeInstructions, realtimeModel, type RealtimeClientSecretResponse } from "../../../../lib/realtime";

export const runtime = "nodejs";

export async function POST() {
  if (!globalThis.process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is required for realtime voice." }, { status: 500 });
  }

  try {
    const [resident, history] = await Promise.all([loadResident(), loadHistory()]);
    const openai = new OpenAI({ apiKey: globalThis.process.env.OPENAI_API_KEY });
    const session = await openai.realtime.clientSecrets.create({
      session: {
        type: "realtime",
        model: realtimeModel,
        instructions: buildRealtimeInstructions(resident, history),
        output_modalities: ["audio"],
        audio: {
          input: {
            transcription: {
              model: "gpt-4o-mini-transcribe",
              language: resident.language,
            },
            turn_detection: {
              type: "server_vad",
              create_response: true,
              interrupt_response: true,
            },
          },
        },
      },
    });

    if (!session.value.startsWith("ek_")) {
      throw new Error("Realtime client secret response was not ephemeral.");
    }

    const body: RealtimeClientSecretResponse = {
      clientSecret: {
        value: session.value,
        expiresAt: session.expires_at,
      },
    };
    return NextResponse.json(body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Realtime session failed." }, { status: 500 });
  }
}
