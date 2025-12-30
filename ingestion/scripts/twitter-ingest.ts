import { ConvexHttpClient } from "convex/browser";
import { readFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import { api } from "../../convex/_generated/api.js";

const CONVEX_URL = process.env.CONVEX_URL;
const BOOKMARKS_DIR = process.env.TWITTER_BOOKMARKS_DIR || `${process.env.HOME}/Downloads`;

if (!CONVEX_URL) {
  console.error("CONVEX_URL environment variable required");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);

interface TweetBookmark {
  authorName: string;
  handle: string;
  tweetText: string;
  time: string;
  postUrl: string;
  media: string[];
  isRetweet: boolean;
  interaction: {
    replies: number;
    reposts: number;
    likes: number;
    bookmarks: number;
    views: number;
  };
}

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+/g;
  return text.match(urlRegex) || [];
}

function extractGitHubRepos(text: string): string[] {
  const repoRegex = /github\.com\/([a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)/g;
  const matches = text.matchAll(repoRegex);
  return Array.from(matches, (m) => m[1]);
}

function inferTopics(text: string): string[] {
  const topics: string[] = [];
  const lowered = text.toLowerCase();

  if (lowered.includes("rust") || lowered.includes("cargo")) topics.push("rust");
  if (lowered.includes("typescript") || lowered.includes("ts")) topics.push("typescript");
  if (lowered.includes("react") || lowered.includes("next")) topics.push("react");
  if (lowered.includes("ai") || lowered.includes("llm") || lowered.includes("gpt")) topics.push("ai");
  if (lowered.includes("agent") || lowered.includes("claude") || lowered.includes("cursor")) topics.push("agents");
  if (lowered.includes("open source") || lowered.includes("oss")) topics.push("opensource");

  return topics;
}

async function findBookmarkFiles(): Promise<string[]> {
  const files = readdirSync(BOOKMARKS_DIR);
  return files
    .filter((f) => f.match(/nicopreme-tweets.*\.json$/i))
    .map((f) => join(BOOKMARKS_DIR, f));
}

async function processFile(filePath: string): Promise<void> {
  const batchFile = basename(filePath);
  console.log(`Processing ${batchFile}...`);

  const content = readFileSync(filePath, "utf-8");
  const bookmarks: TweetBookmark[] = JSON.parse(content);

  const processed = bookmarks.map((b) => ({
    postUrl: b.postUrl,
    authorName: b.authorName,
    authorHandle: b.handle,
    tweetText: b.tweetText,
    timestamp: new Date(b.time).getTime(),
    extractedLinks: extractUrls(b.tweetText),
    extractedRepos: extractGitHubRepos(b.tweetText),
    topics: inferTopics(b.tweetText),
    importedAt: Date.now(),
    batchFile,
  }));

  const result = await client.mutation(api.bookmarks.batchInsert, {
    bookmarks: processed,
  });

  console.log(`Imported ${result.inserted}, skipped ${result.skipped} duplicates`);
}

async function main() {
  const files = await findBookmarkFiles();

  if (files.length === 0) {
    console.log(`No bookmark files found in ${BOOKMARKS_DIR}`);
    console.log("Expected format: nicopreme-tweets-*.json");
    return;
  }

  console.log(`Found ${files.length} bookmark file(s)`);

  for (const file of files) {
    await processFile(file);
  }

  console.log("Twitter bookmark ingestion complete");
}

main().catch(console.error);
