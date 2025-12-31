import { db } from "../lib/db.js";

function parseArgs(args: string[]): { postUrl: string; limit: number } {
  let postUrl = "";
  let limit = 10;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[++i], 10);
    } else if (!args[i].startsWith("--")) {
      postUrl = args[i];
    }
  }

  return { postUrl, limit };
}

interface VecResult {
  rowid: number;
  distance: number;
}

interface BookmarkRow {
  post_url: string;
  author_handle: string;
  tweet_text: string;
  topics: string;
  timestamp: number;
  vec_rowid: number;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: tweets similar <postUrl> [--limit N]");
    process.exit(1);
  }

  const { postUrl, limit } = parseArgs(args);

  if (!postUrl) {
    console.error("Post URL required");
    process.exit(1);
  }

  const mapping = db
    .prepare(
      `
    SELECT m.vec_rowid
    FROM bookmarks b
    JOIN bookmark_embedding_map m ON b.id = m.bookmark_id
    WHERE b.post_url = ?
  `
    )
    .get(postUrl) as { vec_rowid: number } | undefined;

  if (!mapping) {
    console.log("No similar tweets found (tweet may not have embedding)");
    return;
  }

  const embeddingRow = db
    .prepare(`SELECT embedding FROM bookmark_embeddings WHERE rowid = ?`)
    .get(mapping.vec_rowid) as { embedding: Float32Array } | undefined;

  if (!embeddingRow) {
    console.log("No similar tweets found (embedding not found)");
    return;
  }

  const vecResults = db
    .prepare(
      `
    SELECT rowid, distance 
    FROM bookmark_embeddings 
    WHERE embedding MATCH ?
    ORDER BY distance 
    LIMIT ?
  `
    )
    .all(embeddingRow.embedding, limit + 1) as VecResult[];

  const rowids = vecResults
    .filter((r) => r.rowid !== mapping.vec_rowid)
    .map((r) => r.rowid)
    .slice(0, limit);
  const distanceMap = new Map(vecResults.map((r) => [r.rowid, r.distance]));

  if (rowids.length === 0) {
    console.log("No similar tweets found");
    return;
  }

  const placeholders = rowids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `
    SELECT b.*, m.vec_rowid
    FROM bookmarks b
    JOIN bookmark_embedding_map m ON b.id = m.bookmark_id
    WHERE m.vec_rowid IN (${placeholders})
  `
    )
    .all(...rowids) as BookmarkRow[];

  const results = rows
    .map((r) => ({ ...r, distance: distanceMap.get(r.vec_rowid) || 0 }))
    .sort((a, b) => a.distance - b.distance);

  console.log(
    JSON.stringify(
      results.map((r) => ({
        postUrl: r.post_url,
        author: r.author_handle,
        preview: r.tweet_text.slice(0, 100) + (r.tweet_text.length > 100 ? "..." : ""),
        topics: JSON.parse(r.topics || "[]"),
        timestamp: new Date(r.timestamp).toISOString(),
      })),
      null,
      2
    )
  );

  console.log(`\n${results.length} similar tweets`);
}

main().catch(console.error);
