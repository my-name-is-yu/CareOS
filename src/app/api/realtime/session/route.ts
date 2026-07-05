import { NextResponse } from "next/server";
import OpenAI from "openai";

import { loadResident } from "../../../../lib/data";
import { loadLatestProfile } from "../../../../lib/profiles";
import { buildRealtimeInstructions, realtimeModel, type RealtimeClientSecretResponse } from "../../../../lib/realtime";
import { loadRecords } from "../../../../lib/records";

export const runtime = "nodejs";

const RESIDENT_ID = "aiko-mori";

export async function POST() {
  if (!globalThis.process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is required for realtime voice." }, { status: 500 });
  }

  try {
    const [resident, profile, records] = await Promise.all([
      loadResident(),
      loadLatestProfile(RESIDENT_ID),
      loadRecords(RESIDENT_ID),
    ]);
    const recentRecords = [...records]
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0))
      .slice(0, 10);

    const openai = new OpenAI({ apiKey: globalThis.process.env.OPENAI_API_KEY });
    const session = await openai.realtime.clientSecrets.create({
      session: {
        type: "realtime",
        model: realtimeModel,
        instructions: buildRealtimeInstructions({ resident, profile, recentRecords }),
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
          output: {
            voice: "marin",
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
