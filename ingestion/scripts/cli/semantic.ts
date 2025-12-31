import { db } from "../lib/db.js";
import { generateEmbedding } from "../lib/embeddings.js";

function parseArgs(args: string[]): { query: string; author?: string; limit: number } {
  let query = "";
  let author: string | undefined;
  let limit = 20;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--author" && args[i + 1]) {
      author = args[++i];
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[++i], 10);
    } else if (!args[i].startsWith("--")) {
      query = args[i];
    }
  }

  return { query, author, limit };
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
    console.log("Usage: tweets semantic <query> [--author handle] [--limit N]");
    process.exit(1);
  }

  const { query, author, limit } = parseArgs(args);

  if (!query) {
    console.error("Query required for semantic search");
    process.exit(1);
  }

  console.error("Generating embedding for query...");
  const embedding = await generateEmbedding(query);
  const queryVec = new Float32Array(embedding);

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
    .all(queryVec, limit * 2) as VecResult[];

  if (vecResults.length === 0) {
    console.log("No results found");
    return;
  }

  const rowids = vecResults.map((r) => r.rowid);
  const distanceMap = new Map(vecResults.map((r) => [r.rowid, r.distance]));

  const placeholders = rowids.map(() => "?").join(",");
  let sql = `
    SELECT b.*, m.vec_rowid
    FROM bookmarks b
    JOIN bookmark_embedding_map m ON b.id = m.bookmark_id
    WHERE m.vec_rowid IN (${placeholders})
  `;
  const params: (string | number)[] = [...rowids];

  if (author) {
    sql += " AND LOWER(b.author_handle) = LOWER(?)";
    params.push(author);
  }

  const rows = db.prepare(sql).all(...params) as BookmarkRow[];

  const results = rows
    .map((r) => ({ ...r, distance: distanceMap.get(r.vec_rowid) || 0 }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);

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

  console.log(`\n${results.length} results`);
}

main().catch(console.error);
