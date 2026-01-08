#!/usr/bin/env npx tsx
import { Command } from "commander";
import { execSync, spawn } from "child_process";

const API_URL = process.env.AGENT_REFLECTION_API || "http://localhost:3001";

const program = new Command();

program.name("saved-videos").description("Search and explore your saved YouTube videos").version("1.0.0");

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, options);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

interface SavedVideo {
  id: number;
  videoId: string;
  url: string;
  title: string;
  channelName: string | null;
  channelId: string | null;
  description: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  tags: string[];
  viewCount: number | null;
  source: string;
  savedAt: string;
  transcript: string | null;
  transcriptFetchedAt: string | null;
  _score?: number;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "?:??";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatVideo(v: SavedVideo, verbose = false): string {
  const duration = formatDuration(v.durationSeconds);
  const views = v.viewCount ? `${(v.viewCount / 1000).toFixed(0)}K views` : "? views";
  const scoreStr = v._score !== undefined ? ` (${(v._score * 100).toFixed(0)}%)` : "";
  const source = v.source === "both" ? "[liked+WL]" : v.source === "liked" ? "[liked]" : "[WL]";
  const hasTranscript = v.transcript ? " [T]" : "";

  let output = `${v.title}${scoreStr}${hasTranscript}
   ${v.channelName || "Unknown channel"} | ${duration} | ${views} | ${source}
   ${v.url}`;

  if (verbose && v.description) {
    output += `\n   ${v.description.slice(0, 200)}...`;
  }

  return output;
}

function output(results: SavedVideo[], json: boolean, formatter?: (r: SavedVideo) => string) {
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
  .description("Semantic/vector search - find videos by meaning")
  .option("--source <source>", "Filter by source: liked, watch_later, both")
  .option("--channel <channel>", "Filter by channel name")
  .option("-l, --limit <n>", "Max results", "10")
  .option("-j, --json", "Output as JSON")
  .action(async (query: string, opts) => {
    console.error("Searching...");
    const results = await api("/api/videos/semantic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        source: opts.source,
        channel: opts.channel,
        limit: parseInt(opts.limit),
      }),
    });
    output(results, opts.json, formatVideo);
  });

program
  .command("search <query>")
  .alias("f")
  .description("Full-text keyword search")
  .option("--source <source>", "Filter by source: liked, watch_later, both")
  .option("--channel <channel>", "Filter by channel name")
  .option("-l, --limit <n>", "Max results", "20")
  .option("-j, --json", "Output as JSON")
  .action(async (query: string, opts) => {
    const params = new URLSearchParams({
      q: query,
      limit: opts.limit,
    });
    if (opts.source) params.set("source", opts.source);
    if (opts.channel) params.set("channel", opts.channel);

    const results = await api(`/api/videos/search?${params}`);
    output(results, opts.json, formatVideo);
  });

program
  .command("get <videoId>")
  .description("Get full details of a specific video")
  .option("-j, --json", "Output as JSON")
  .action(async (videoId: string, opts) => {
    const result = (await api(`/api/videos/${encodeURIComponent(videoId)}`)) as SavedVideo;

    if (!result || !result.videoId) {
      console.error("Video not found in saved collection");
      process.exit(1);
    }

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`${result.title}`);
      console.log(`${result.url}`);
      console.log("");
      console.log(`Channel: ${result.channelName || "Unknown"}`);
      console.log(`Duration: ${formatDuration(result.durationSeconds)}`);
      console.log(`Views: ${result.viewCount?.toLocaleString() || "?"}`);
      console.log(`Published: ${result.publishedAt || "?"}`);
      console.log(`Source: ${result.source}`);
      console.log(`Saved: ${result.savedAt}`);
      if (result.tags?.length) {
        console.log(`Tags: ${result.tags.join(", ")}`);
      }
      if (result.transcript) {
        console.log(`\n--- Transcript (excerpt) ---\n${result.transcript.slice(0, 2000)}...`);
      } else {
        console.log(`\nNo transcript. Run: saved-videos transcript ${result.videoId}`);
      }
    }
  });

program
  .command("transcript <videoId>")
  .description("Fetch and store transcript for a video")
  .option("-j, --json", "Output as JSON")
  .action(async (videoId: string, opts) => {
    console.error("Fetching transcript...");
    const result = await api(`/api/videos/${encodeURIComponent(videoId)}/transcript`, {
      method: "POST",
    });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.error) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    } else if (result.cached) {
      console.log("Transcript already exists");
      console.log(`Length: ${result.length} characters`);
    } else {
      console.log("Transcript fetched and stored");
      console.log(`Length: ${result.length} characters`);
      if (result.segments) {
        console.log(`Segments: ${result.segments}`);
      }
    }
  });

program
  .command("list")
  .description("List saved videos")
  .option("--source <source>", "Filter by source: liked, watch_later, both")
  .option("--channel <channel>", "Filter by channel name")
  .option("-l, --limit <n>", "Max results", "20")
  .option("-j, --json", "Output as JSON")
  .action(async (opts) => {
    const params = new URLSearchParams({ limit: opts.limit });
    if (opts.source) params.set("source", opts.source);
    if (opts.channel) params.set("channel", opts.channel);

    const results = await api(`/api/videos?${params}`);
    output(results, opts.json, formatVideo);
  });

program
  .command("recent")
  .description("Most recently saved videos")
  .option("--source <source>", "Filter by source: liked, watch_later, both")
  .option("-l, --limit <n>", "Number of videos", "10")
  .option("-j, --json", "Output as JSON")
  .action(async (opts) => {
    const params = new URLSearchParams({ limit: opts.limit });
    if (opts.source) params.set("source", opts.source);

    const results = await api(`/api/videos?${params}`);
    output(results, opts.json, formatVideo);
  });

program
  .command("stats")
  .description("Show statistics about your saved videos")
  .option("-j, --json", "Output as JSON")
  .action(async (opts) => {
    const stats = await api("/api/videos/stats");

    if (opts.json) {
      console.log(JSON.stringify(stats, null, 2));
    } else {
      console.log(`Total saved videos: ${stats.total.toLocaleString()}`);
      console.log(`With embeddings: ${stats.withEmbeddings.toLocaleString()}`);
      console.log(`With transcripts: ${stats.withTranscripts.toLocaleString()}`);
      console.log("");
      console.log("By source:");
      stats.bySource?.forEach((s: { source: string; count: number }) => 
        console.log(`  ${s.source}: ${s.count}`)
      );
      console.log("");
      console.log("Top channels:");
      stats.topChannels?.slice(0, 10).forEach((c: { channel: string; count: number }) => 
        console.log(`  ${c.channel}: ${c.count}`)
      );
    }
  });

program
  .command("channels")
  .description("List channels with video counts")
  .option("-l, --limit <n>", "Max channels to show", "20")
  .option("-j, --json", "Output as JSON")
  .action(async (opts) => {
    const results = await api(`/api/videos/channels?limit=${opts.limit}`);

    if (opts.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      results.forEach((c: { channel: string; count: number }) => 
        console.log(`${c.channel}: ${c.count}`)
      );
    }
  });

program
  .command("ask <question>")
  .description("Ask Gemini about a saved video (semantic search → surf gemini --youtube)")
  .option("--source <source>", "Filter by source: liked, watch_later, both")
  .option("--channel <channel>", "Filter by channel name")
  .option("-n, --pick <n>", "Which result to use (1-indexed)", "1")
  .option("--list", "Show matching videos and prompt for selection")
  .option("--model <model>", "Gemini model: gemini-3-pro, gemini-2.5-pro, gemini-2.5-flash")
  .option("--timeout <seconds>", "Timeout in seconds", "120")
  .option("--dry-run", "Show what would be executed without running")
  .action(async (question: string, opts) => {
    // 1. Semantic search for matching videos
    console.error("Searching saved videos...");
    const results: SavedVideo[] = await api("/api/videos/semantic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: question,
        source: opts.source,
        channel: opts.channel,
        limit: opts.list ? 10 : 5,
      }),
    });

    if (results.length === 0) {
      console.error("No matching videos found in your saved collection.");
      process.exit(1);
    }

    let selectedVideo: SavedVideo;

    if (opts.list) {
      // Show results and prompt for selection
      console.error("\nMatching videos:");
      results.forEach((v, i) => {
        const score = v._score !== undefined ? ` (${(v._score * 100).toFixed(0)}%)` : "";
        console.error(`  ${i + 1}. ${v.title}${score}`);
        console.error(`     ${v.channelName || "Unknown"} | ${formatDuration(v.durationSeconds)}`);
      });
      console.error("");

      // Read selection from stdin
      const readline = await import("readline");
      const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
      const answer = await new Promise<string>((resolve) => {
        rl.question("Select video (1-" + results.length + "): ", resolve);
      });
      rl.close();

      const pick = parseInt(answer, 10);
      if (isNaN(pick) || pick < 1 || pick > results.length) {
        console.error("Invalid selection");
        process.exit(1);
      }
      selectedVideo = results[pick - 1];
    } else {
      // Use --pick option (default: 1)
      const pickIndex = parseInt(opts.pick, 10) - 1;
      if (pickIndex < 0 || pickIndex >= results.length) {
        console.error(`Invalid pick: ${opts.pick}. Found ${results.length} results.`);
        process.exit(1);
      }
      selectedVideo = results[pickIndex];
    }

    const score = selectedVideo._score !== undefined ? ` (${(selectedVideo._score * 100).toFixed(0)}% match)` : "";
    console.error(`\nUsing: ${selectedVideo.title}${score}`);
    console.error(`       ${selectedVideo.url}\n`);

    // 2. Build surf gemini command
    const args = ["gemini", question, "--youtube", selectedVideo.url];
    if (opts.model) args.push("--model", opts.model);
    if (opts.timeout) args.push("--timeout", opts.timeout);

    if (opts.dryRun) {
      console.log(`surf ${args.map(a => a.includes(" ") ? `"${a}"` : a).join(" ")}`);
      process.exit(0);
    }

    // 3. Execute surf gemini
    const surf = spawn("surf", args, { stdio: ["inherit", "inherit", "inherit"] });
    surf.on("close", (code) => process.exit(code || 0));
  });

program
  .command("url <query>")
  .description("Get URL of best matching video (for piping)")
  .option("--source <source>", "Filter by source: liked, watch_later, both")
  .option("--channel <channel>", "Filter by channel name")
  .action(async (query: string, opts) => {
    const results: SavedVideo[] = await api("/api/videos/semantic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        source: opts.source,
        channel: opts.channel,
        limit: 1,
      }),
    });

    if (results.length === 0) {
      console.error("No matching videos found");
      process.exit(1);
    }

    console.log(results[0].url);
  });

program.parse(process.argv);
