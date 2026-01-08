#!/usr/bin/env npx tsx
/**
 * Generate embeddings for starred repos in batches.
 * Designed to run periodically via launchd (e.g., every hour).
 * 
 * Environment variables:
 *   BATCH_SIZE - repos per API call (default: 20)
 *   MAX_REPOS - max repos per run (default: 200)
 */
import { db } from "./lib/db.js";
import { generateEmbeddings } from "./lib/embeddings.js";

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "20");
const MAX_REPOS = parseInt(process.env.MAX_REPOS || "200");

interface StarredRepo {
  id: string;
  full_name: string;
  description: string | null;
  primary_language: string | null;
  topics: string | null;
  readme_content: string | null;
}

function buildEmbeddingText(repo: StarredRepo): string {
  const parts = [
    repo.full_name,
    repo.description || "",
    repo.primary_language ? `Language: ${repo.primary_language}` : "",
    repo.topics ? `Topics: ${JSON.parse(repo.topics).join(", ")}` : "",
    repo.readme_content?.slice(0, 4000) || "",
  ];
  return parts.filter(Boolean).join("\n\n").slice(0, 8000);
}

async function main() {
  const pending = db.prepare(`
    SELECT COUNT(*) as count FROM starred_repos sr
    LEFT JOIN star_embedding_map sem ON sr.id = sem.repo_id
    WHERE sem.repo_id IS NULL
  `).get() as { count: number };

  if (pending.count === 0) {
    console.log("All repos have embeddings");
    db.close();
    return;
  }

  const repos = db.prepare(`
    SELECT sr.* FROM starred_repos sr
    LEFT JOIN star_embedding_map sem ON sr.id = sem.repo_id
    WHERE sem.repo_id IS NULL
    ORDER BY sr.starred_at DESC
    LIMIT ?
  `).all(MAX_REPOS) as StarredRepo[];

  console.log(`Generating embeddings for ${repos.length} of ${pending.count} pending repos...`);

  const insertEmbedding = db.prepare("INSERT INTO star_embeddings (embedding) VALUES (vec_f32(?))");
  const insertMap = db.prepare("INSERT INTO star_embedding_map (repo_id, vec_rowid) VALUES (?, ?)");

  for (let i = 0; i < repos.length; i += BATCH_SIZE) {
    const batch = repos.slice(i, i + BATCH_SIZE);
    const texts = batch.map(buildEmbeddingText);

    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(repos.length / BATCH_SIZE)}...`);

    const embeddings = await generateEmbeddings(texts);

    const insertBatch = db.transaction(() => {
      for (let j = 0; j < batch.length; j++) {
        const result = insertEmbedding.run(JSON.stringify(embeddings[j]));
        insertMap.run(batch[j].id, result.lastInsertRowid);
      }
    });

    insertBatch();

    await new Promise((r) => setTimeout(r, 500));
  }

  const remaining = pending.count - repos.length;
  console.log(`Done! ${remaining} repos remaining`);
  db.close();
}

main().catch(console.error);
