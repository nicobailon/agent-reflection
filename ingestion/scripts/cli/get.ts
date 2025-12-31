import { db } from "../lib/db.js";

interface BookmarkRow {
  post_url: string;
  author_handle: string;
  author_name: string;
  tweet_text: string;
  topics: string;
  timestamp: number;
  interaction_likes: number;
  interaction_reposts: number;
  interaction_views: number;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: tweets get <postUrl> [postUrl2 ...]");
    process.exit(1);
  }

  const urls = args.filter((a) => !a.startsWith("--"));

  if (urls.length === 0) {
    console.error("At least one post URL required");
    process.exit(1);
  }

  const placeholders = urls.map(() => "?").join(",");
  const results = db
    .prepare(`SELECT * FROM bookmarks WHERE post_url IN (${placeholders})`)
    .all(...urls) as BookmarkRow[];

  if (results.length === 0) {
    console.log("No tweets found for provided URLs");
    return;
  }

  for (const r of results) {
    console.log("---");
    console.log(`@${r.author_handle} (${r.author_name})`);
    console.log(`${new Date(r.timestamp).toISOString()}`);
    console.log(`${r.post_url}\n`);
    console.log(r.tweet_text);
    console.log(`\nTopics: ${JSON.parse(r.topics || "[]").join(", ") || "none"}`);
    console.log(`Likes: ${r.interaction_likes} | Reposts: ${r.interaction_reposts} | Views: ${r.interaction_views}`);
    console.log("");
  }
}

main().catch(console.error);
