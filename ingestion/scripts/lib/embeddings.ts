import OpenAI from "openai";

function getClient(): OpenAI {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  
  if (openrouterKey) {
    return new OpenAI({
      apiKey: openrouterKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }
  
  if (openaiKey) {
    return new OpenAI({ apiKey: openaiKey });
  }
  
  throw new Error("OPENROUTER_API_KEY or OPENAI_API_KEY required");
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getClient();
  const response = await client.embeddings.create({
    model: "openai/text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const client = getClient();
  const response = await client.embeddings.create({
    model: "openai/text-embedding-3-small",
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}
