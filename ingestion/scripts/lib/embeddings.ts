import OpenAI from "openai";

function getClient(): { client: OpenAI; model: string } {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (openrouterKey) {
    return {
      client: new OpenAI({
        apiKey: openrouterKey,
        baseURL: "https://openrouter.ai/api/v1",
      }),
      model: "openai/text-embedding-3-small",
    };
  }

  if (openaiKey) {
    return {
      client: new OpenAI({ apiKey: openaiKey }),
      model: "text-embedding-3-small",
    };
  }

  throw new Error("OPENROUTER_API_KEY or OPENAI_API_KEY required");
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const { client, model } = getClient();
  const response = await client.embeddings.create({ model, input: text });
  return response.data[0].embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const { client, model } = getClient();
  const response = await client.embeddings.create({ model, input: texts });
  return response.data.map((d) => d.embedding);
}
