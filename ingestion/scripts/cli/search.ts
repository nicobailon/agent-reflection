import { db } from "../lib/db.js";

function parseArgs(args: string[]): { query: string; author?: string; topic?: string; limit: number } {
  let query = "";
  let author: string | undefined;
  let topic: string | undefined;
  let limit = 20;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--author" && args[i + 1]) {
      author = args[++i];
    } else if (args[i] === "--topic" && args[i + 1]) {
      topic = args[++i];
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[++i], 10);
    } else if (!args[i].startsWith("--")) {
      query = args[i];
    }
  }

  return { query, author, topic, limit };
}

interface BookmarkRow {
  post_url: string;
  author_handle: string;
  tweet_text: string;
  topics: string;
  timestamp: number;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: tweets search <query> [--author handle] [--topic topic] [--limit N]");
    process.exit(1);
  }

  const { query, author, topic, limit } = parseArgs(args);

  let sql = "SELECT * FROM bookmarks WHERE 1=1";
  const params: (string | number)[] = [];

  if (author) {
    sql += " AND LOWER(author_handle) = LOWER(?)";
    params.push(author);
  }

  sql += " ORDER BY timestamp DESC LIMIT ?";
  params.push(limit * 2);

  let rows = db.prepare(sql).all(...params) as BookmarkRow[];

  if (query) {
    const q = query.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.tweet_text?.toLowerCase().includes(q) || r.author_handle?.toLowerCase().includes(q)
    );
  }

  if (topic) {
    rows = rows.filter((r) => {
      const topics = JSON.parse(r.topics || "[]") as string[];
      return topics.includes(topic);
    });
  }

  const results = rows.slice(0, limit);

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
