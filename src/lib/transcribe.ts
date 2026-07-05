import OpenAI from "openai";

export async function transcribeFormData(formData: FormData, apiKey = process.env.OPENAI_API_KEY): Promise<{ text: string }> {
  const audio = formData.get("audio");
  if (!(audio instanceof File)) {
    throw new Error("Missing audio upload.");
  }
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for transcription.");
  }

  const client = new OpenAI({ apiKey });
  const transcription = await client.audio.transcriptions.create({
    file: audio,
    model: "gpt-4o-transcribe",
  });

  return { text: transcription.text };
}
