import { db } from "../lib/db.js";

interface BookmarkRow {
  topics: string;
  author_handle: string;
  interaction_views: number;
  interaction_likes: number;
  timestamp: number;
}

async function main() {
  const args = process.argv.slice(2);
  const byTopic = args.includes("--by-topic") || args.includes("--topics");
  const byAuthor = args.includes("--by-author") || args.includes("--authors");

  const total = (db.prepare("SELECT COUNT(*) as count FROM bookmarks").get() as { count: number }).count;
  const withEmbeddings = (db.prepare("SELECT COUNT(*) as count FROM bookmark_embeddings").get() as { count: number })
    .count;

  const sample = db.prepare("SELECT * FROM bookmarks ORDER BY timestamp DESC LIMIT 1000").all() as BookmarkRow[];

  const topicCounts = new Map<string, number>();
  const authorCounts = new Map<string, number>();
  let totalViews = 0;
  let totalLikes = 0;
  let minTs = Infinity;
  let maxTs = 0;

  for (const b of sample) {
    const topics = JSON.parse(b.topics || "[]") as string[];
    for (const topic of topics) {
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    }
    authorCounts.set(b.author_handle, (authorCounts.get(b.author_handle) || 0) + 1);
    totalViews += b.interaction_views || 0;
    totalLikes += b.interaction_likes || 0;
    if (b.timestamp) {
      minTs = Math.min(minTs, b.timestamp);
      maxTs = Math.max(maxTs, b.timestamp);
    }
  }

  const topTopics = Array.from(topicCounts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);

  const topAuthors = Array.from(authorCounts.entries())
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count);

  const dateRange =
    sample.length > 0
      ? {
          earliest: new Date(minTs).toISOString(),
          latest: new Date(maxTs).toISOString(),
        }
      : null;

  if (byTopic) {
    console.log("Topics:\n");
    for (const t of topTopics) {
      console.log(`  ${t.topic}: ${t.count}`);
    }
    return;
  }

  if (byAuthor) {
    console.log("Top Authors:\n");
    for (const a of topAuthors) {
      console.log(`  @${a.author}: ${a.count}`);
    }
    return;
  }

  console.log("Twitter Bookmarks Stats\n");
  console.log(`Total tweets: ${total}`);
  console.log(`With embeddings: ${withEmbeddings}`);
  console.log(`Total views: ${totalViews.toLocaleString()}`);
  console.log(`Total likes: ${totalLikes.toLocaleString()}`);

  if (dateRange) {
    console.log(`\nDate range:`);
    console.log(`  Earliest: ${dateRange.earliest}`);
    console.log(`  Latest: ${dateRange.latest}`);
  }

  console.log(`\nTop Topics:`);
  for (const t of topTopics.slice(0, 5)) {
    console.log(`  ${t.topic}: ${t.count}`);
  }

  console.log(`\nTop Authors:`);
  for (const a of topAuthors.slice(0, 5)) {
    console.log(`  @${a.author}: ${a.count}`);
  }
}

main().catch(console.error);
