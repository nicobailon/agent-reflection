#!/usr/bin/env npx tsx
import { Command } from "commander";

const API_URL = process.env.TWEETS_API_URL || "http://macmini:3001";

const program = new Command();

program
  .name("tweets")
  .description("Search and explore your Twitter bookmarks and likes")
  .version("1.0.0");

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, options);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

interface Bookmark {
  id: string;
  postUrl: string;
  authorHandle: string;
  authorName: string;
  tweetText: string;
  topics: string[];
  timestamp: number;
  source: string;
  interaction?: {
    likes: number;
    views: number;
  };
  _score?: number;
}

function formatTweet(b: Bookmark): string {
  const date = new Date(b.timestamp).toLocaleDateString();
  const topics = (b.topics || []).slice(0, 3).join(", ");
  const scoreStr = b._score !== undefined ? ` (${(b._score * 100).toFixed(0)}%)` : "";
  const sourceIcon = b.source === "both" ? "[B+L]" : b.source === "like" ? "[L]" : "[B]";
  const text = b.tweetText || "";
  
  return `${sourceIcon} @${b.authorHandle}${scoreStr} - ${date}
   ${text.slice(0, 120)}${text.length > 120 ? "..." : ""}
   ${topics ? `[${topics}]` : ""} ${b.postUrl}`;
}

function output(results: any[], json: boolean, formatter?: (r: any) => string) {
  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else if (results.length === 0) {
    console.log("No results found.");
  } else {
    results.forEach((r, i) => {
      if (i > 0) console.log("");
      console.log(formatter ? formatter(r) : JSON.stringify(r));
    });
    console.log(`\n${results.length} result(s)`);
  }
}

program
  .command("semantic <query>")
  .alias("s")
  .description("Semantic/vector search - find tweets by meaning")
  .option("-a, --author <handle>", "Filter by author handle")
  .option("-l, --limit <n>", "Max results", "10")
  .option("-j, --json", "Output as JSON")
  .action(async (query: string, opts) => {
    console.error("Searching...");
    const results = await api("/api/bookmarks/semantic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, author: opts.author, limit: parseInt(opts.limit) }),
    });
    output(results, opts.json, formatTweet);
  });

program
  .command("search <query>")
  .alias("f")
  .description("Full-text search - find tweets by keywords")
  .option("-a, --author <handle>", "Filter by author handle")
  .option("-t, --topic <topic>", "Filter by topic")
  .option("-l, --limit <n>", "Max results", "20")
  .option("-j, --json", "Output as JSON")
  .action(async (query: string, opts) => {
    const params = new URLSearchParams({
      q: query,
      limit: opts.limit,
    });
    if (opts.author) params.set("author", opts.author);
    if (opts.topic) params.set("topic", opts.topic);
    
    const results = await api(`/api/bookmarks/search?${params}`);
    output(results, opts.json, formatTweet);
  });

program
  .command("similar <url>")
  .alias("sim")
  .description("Find tweets similar to a given one")
  .option("-l, --limit <n>", "Max results", "10")
  .option("-j, --json", "Output as JSON")
  .action(async (url: string, opts) => {
    console.error("Finding similar...");
    const results = await api("/api/bookmarks/similar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postUrl: url, limit: parseInt(opts.limit) }),
    });
    output(results, opts.json, formatTweet);
  });

program
  .command("get <url>")
  .description("Get full details of a specific tweet")
  .option("-j, --json", "Output as JSON")
  .action(async (url: string, opts) => {
    const params = new URLSearchParams({ query: url, limit: "1" });
    const results = await api(`/api/bookmarks?${params}`);
    
    if (results.length === 0) {
      console.error("Tweet not found");
      process.exit(1);
    }

    const b = results[0] as Bookmark;
    if (opts.json) {
      console.log(JSON.stringify(b, null, 2));
    } else {
      console.log(`@${b.authorHandle} (${b.authorName})`);
      console.log(`Date: ${new Date(b.timestamp).toLocaleString()}`);
      console.log(`Source: ${b.source}`);
      console.log(`URL: ${b.postUrl}`);
      console.log(`\n${b.tweetText}`);
      if (b.topics?.length) console.log(`\nTopics: ${b.topics.join(", ")}`);
      if (b.interaction) {
        console.log(`\nLikes: ${b.interaction.likes?.toLocaleString() || 0} | Views: ${b.interaction.views?.toLocaleString() || 0}`);
      }
    }
  });

program
  .command("stats")
  .description("Show statistics about your bookmarks")
  .option("-j, --json", "Output as JSON")
  .action(async (opts) => {
    const stats = await api("/api/bookmarks/stats");

    if (opts.json) {
      console.log(JSON.stringify(stats, null, 2));
    } else {
      console.log(`Total tweets: ${stats.total.toLocaleString()}`);
      console.log(`With embeddings: ${stats.withEmbeddings.toLocaleString()}`);
      console.log(`\nBy source:`);
      stats.sourceBreakdown?.forEach((s: any) => console.log(`  ${s.source}: ${s.count.toLocaleString()}`));
      console.log(`\nTop authors:`);
      stats.topAuthors?.slice(0, 5).forEach((a: any) => console.log(`  @${a.author}: ${a.count}`));
      console.log(`\nTop topics:`);
      stats.topTopics?.slice(0, 5).forEach((t: any) => console.log(`  ${t.topic}: ${t.count}`));
    }
  });

program
  .command("topics")
  .description("List all topics with counts")
  .option("-l, --limit <n>", "Max topics to show", "20")
  .option("-j, --json", "Output as JSON")
  .action(async (opts) => {
    const results = await api("/api/bookmarks/topics");
    const limited = results.slice(0, parseInt(opts.limit));

    if (opts.json) {
      console.log(JSON.stringify(limited, null, 2));
    } else {
      limited.forEach((r: any) => console.log(`${r.topic}: ${r.count}`));
    }
  });

program
  .command("authors")
  .description("List top authors by bookmark count")
  .option("-l, --limit <n>", "Max authors to show", "20")
  .option("-j, --json", "Output as JSON")
  .action(async (opts) => {
    const stats = await api("/api/bookmarks/stats");
    const authors = stats.topAuthors?.slice(0, parseInt(opts.limit)) || [];

    if (opts.json) {
      console.log(JSON.stringify(authors, null, 2));
    } else {
      authors.forEach((a: any) => console.log(`@${a.author}: ${a.count}`));
    }
  });

program
  .command("recent")
  .description("Show most recent bookmarks")
  .option("-l, --limit <n>", "Number of tweets", "10")
  .option("-s, --source <type>", "Filter by source (bookmark/like/both)")
  .option("-j, --json", "Output as JSON")
  .action(async (opts) => {
    const params = new URLSearchParams({ limit: opts.limit });
    if (opts.source) params.set("source", opts.source);
    
    const results = await api(`/api/bookmarks?${params}`);
    output(results, opts.json, formatTweet);
  });

program.parse(process.argv);
