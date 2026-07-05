import OpenAI from "openai";

type RealtimeSessionResponse = {
  client_secret?: unknown;
  [key: string]: unknown;
};

type RealtimeClient = {
  realtime: {
    clientSecrets: {
      // eslint-disable-next-line no-unused-vars
      create(body: { session: { type: "realtime"; model: string; audio?: { output?: { voice?: string } } } }): Promise<RealtimeSessionResponse>;
    };
  };
};

function stripServerKey(value: unknown, apiKey: string): unknown {
  if (typeof value === "string") return value === apiKey ? undefined : value;
  if (Array.isArray(value)) return value.map((item) => stripServerKey(item, apiKey)).filter((item) => item !== undefined);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["api_key", "apiKey", "OPENAI_API_KEY"].includes(key))
      .map(([key, nested]) => [key, stripServerKey(nested, apiKey)])
      .filter(([, nested]) => nested !== undefined),
  );
}

export async function createRealtimeSession(
  options: {
    apiKey?: string;
    client?: RealtimeClient;
  } = {},
): Promise<Record<string, unknown>> {
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
  const { client_secret: clientSecret, ...rest } = session;

  if (!clientSecret || typeof clientSecret !== "object") {
    throw new Error("Realtime session response did not include an ephemeral client secret.");
  }

  return stripServerKey({ ...rest, client_secret: clientSecret }, apiKey) as Record<string, unknown>;
}
