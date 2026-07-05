import OpenAI from "openai";

type RealtimeSessionResponse = {
  value?: unknown;
  expires_at?: unknown;
  expiresAt?: unknown;
  [key: string]: unknown;
};

type ClientSecret = {
  value: string;
  expiresAt: number;
};

type RealtimeClient = {
  realtime: {
    clientSecrets: {
      // eslint-disable-next-line no-unused-vars
      create(body: { session: { type: "realtime"; model: string; audio?: { output?: { voice?: string } } } }): Promise<RealtimeSessionResponse>;
    };
  };
};

function normalizeClientSecret(session: RealtimeSessionResponse): ClientSecret {
  if (typeof session.value !== "string" || !session.value.startsWith("ek_")) {
    throw new Error("Realtime session response did not include an ephemeral client secret.");
  }

  const expiresAt = session.expiresAt ?? session.expires_at;
  if (typeof expiresAt !== "number") {
    throw new Error("Realtime session response did not include an ephemeral client secret expiration.");
  }

  return { value: session.value, expiresAt };
}

export async function createRealtimeSession(
  options: {
    apiKey?: string;
    client?: RealtimeClient;
  } = {},
): Promise<{ clientSecret: ClientSecret }> {
  const apiKey = options.apiKey ?? globalThis.process?.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for realtime sessions.");
  }

  const client = options.client ?? (new OpenAI({ apiKey }) as unknown as RealtimeClient);
  const session = await client.realtime.clientSecrets.create({
    session: {
      type: "realtime",
      model: "gpt-4o-realtime-preview",
      audio: {
        output: {
          voice: "alloy",
        },
      },
    },
  });
  const serverData = JSON.stringify(session);
  if (serverData.includes(apiKey)) {
    throw new Error("Realtime session response included server-only credentials.");
  }

  return { clientSecret: normalizeClientSecret(session) };
}
