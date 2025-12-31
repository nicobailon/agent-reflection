import { db } from "./lib/db.js";
import { generateEmbeddings } from "./lib/embeddings.js";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, basename } from "path";
import { createHash, randomUUID } from "crypto";
import { homedir } from "os";

const BOOKMARKS_DIR = process.env.TWITTER_BOOKMARKS_DIR || `${homedir()}/data/agent-reflection/twitter`;
const LIKES_DIR = process.env.TWITTER_LIKES_DIR || `${homedir()}/data/agent-reflection/twitter/likes`;
const MANIFEST_PATH = join(BOOKMARKS_DIR, ".processed-sqlite.json");
const EMBEDDING_BATCH_SIZE = 100;

interface TweetRecord {
  authorName: string;
  handle: string;
  tweetText: string;
  time: string;
  postUrl: string;
  interaction: {
    bookmarks: number;
    likes: number;
    replies: number;
    reposts: number;
    views: number;
  };
}

interface ProcessedFile {
  filename: string;
  processedAt: number;
  records: number;
  inserted: number;
  upgraded: number;
  skipped: number;
  source: "bookmark" | "like";
}

interface Manifest {
  files: Record<string, ProcessedFile>;
}

function loadManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) {
    return { files: {} };
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
}

function saveManifest(manifest: Manifest): void {
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function computeHash(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function extractUrls(text: string): string[] {
  if (!text) return [];
  const urlRegex = /https?:\/\/[^\s]+/g;
  return text.match(urlRegex) || [];
}

function extractGitHubRepos(text: string): string[] {
  if (!text) return [];
  const repoRegex = /github\.com\/([a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)/g;
  const matches = text.matchAll(repoRegex);
  return Array.from(matches, (m) => m[1]);
}

function inferTopics(text: string): string[] {
  if (!text) return [];
  const topics: string[] = [];
  const lowered = text.toLowerCase();
  if (lowered.includes("rust") || lowered.includes("cargo")) topics.push("rust");
  if (lowered.includes("typescript") || lowered.includes("ts")) topics.push("typescript");
  if (lowered.includes("react") || lowered.includes("next")) topics.push("react");
  if (lowered.includes("ai") || lowered.includes("llm") || lowered.includes("gpt")) topics.push("ai");
  if (lowered.includes("agent") || lowered.includes("claude") || lowered.includes("cursor")) topics.push("agents");
  if (lowered.includes("svelte") || lowered.includes("sveltekit")) topics.push("svelte");
  if (lowered.includes("python") || lowered.includes("pip")) topics.push("python");
  if (lowered.includes("swift") || lowered.includes("ios") || lowered.includes("swiftui")) topics.push("ios");
  if (lowered.includes("mcp") || lowered.includes("model context protocol")) topics.push("mcp");
  return topics;
}

function isValidSchema(data: unknown): data is TweetRecord[] {
  if (!Array.isArray(data) || data.length === 0) return false;
  const first = data[0];
  return typeof first === "object" && first !== null && "postUrl" in first && "handle" in first;
}

function findFilesInDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("."))
    .map((f) => join(dir, f))
    .filter((filePath) => {
      try {
        const data = JSON.parse(readFileSync(filePath, "utf-8"));
        return isValidSchema(data);
      } catch {
        return false;
      }
    });
}

type TwitterFile = { path: string; hash: string; source: "bookmark" | "like" };

function findTwitterFiles(): TwitterFile[] {
  const files: TwitterFile[] = [];

  for (const path of findFilesInDir(BOOKMARKS_DIR)) {
    files.push({ path, hash: computeHash(path), source: "bookmark" });
  }

  for (const path of findFilesInDir(LIKES_DIR)) {
    files.push({ path, hash: computeHash(path), source: "like" });
  }

  return files;
}

function filterUnprocessedFiles(files: TwitterFile[], manifest: Manifest): TwitterFile[] {
  return files.filter((f) => !manifest.files[f.hash]);
}

async function processFile(
  file: TwitterFile
): Promise<{ records: number; inserted: number; upgraded: number; skipped: number }> {
  const batchFile = basename(file.path);
  console.log(`Processing ${batchFile} (source: ${file.source})...`);

  const content = readFileSync(file.path, "utf-8");
  const tweets: TweetRecord[] = JSON.parse(content);

  console.log(`  Generating embeddings for ${tweets.length} tweets...`);

  const allEmbeddings: number[][] = [];
  for (let i = 0; i < tweets.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = tweets.slice(i, i + EMBEDDING_BATCH_SIZE);
    const texts = batch.map((t) => (t.tweetText || "").trim().slice(0, 8000) || "[empty]");
    const embeddings = await generateEmbeddings(texts);
    allEmbeddings.push(...embeddings);
    console.log(`  Embeddings: ${Math.min(i + EMBEDDING_BATCH_SIZE, tweets.length)}/${tweets.length}`);
  }

  const findByUrl = db.prepare("SELECT id, source FROM bookmarks WHERE post_url = ?");
  const insertBookmark = db.prepare(`
    INSERT INTO bookmarks 
    (id, post_url, author_name, author_handle, tweet_text, timestamp,
     interaction_bookmarks, interaction_likes, interaction_replies, interaction_reposts, interaction_views,
     extracted_links, extracted_repos, topics, imported_at, batch_file, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateSource = db.prepare("UPDATE bookmarks SET source = 'both' WHERE id = ?");
  const insertEmbedding = db.prepare("INSERT INTO bookmark_embeddings (embedding) VALUES (?)");
  const insertEmbeddingMap = db.prepare("INSERT INTO bookmark_embedding_map (bookmark_id, vec_rowid) VALUES (?, ?)");
  let inserted = 0;
  let upgraded = 0;
  let skipped = 0;

  const processAll = db.transaction(() => {
    for (let idx = 0; idx < tweets.length; idx++) {
      const t = tweets[idx];
      const existing = findByUrl.get(t.postUrl) as { id: string; source: string } | undefined;

      if (existing) {
        if (existing.source !== file.source && existing.source !== "both") {
          updateSource.run(existing.id);
          upgraded++;
        } else {
          skipped++;
        }
        continue;
      }

      const id = randomUUID();
      const text = t.tweetText || "";
      insertBookmark.run(
        id,
        t.postUrl,
        t.authorName || "",
        t.handle || "",
        text,
        new Date(t.time).getTime(),
        t.interaction?.bookmarks || 0,
        t.interaction?.likes || 0,
        t.interaction?.replies || 0,
        t.interaction?.reposts || 0,
        t.interaction?.views || 0,
        JSON.stringify(extractUrls(text)),
        JSON.stringify(extractGitHubRepos(text)),
        JSON.stringify(inferTopics(text)),
        Date.now(),
        batchFile,
        file.source
      );

      const embedding = new Float32Array(allEmbeddings[idx]);
      const result = insertEmbedding.run(embedding);
      const vecRowid = Number(result.lastInsertRowid);
      insertEmbeddingMap.run(id, vecRowid);
      inserted++;
    }
  });

  processAll();

  console.log(`  ${inserted} inserted, ${upgraded} upgraded, ${skipped} unchanged`);

  return { records: tweets.length, inserted, upgraded, skipped };
}

async function main() {
  const files = findTwitterFiles();

  if (files.length === 0) {
    console.log(`No Twitter files found in ${BOOKMARKS_DIR} or ${LIKES_DIR}`);
    return;
  }

  const manifest = loadManifest();
  const unprocessed = filterUnprocessedFiles(files, manifest);

  if (unprocessed.length === 0) {
    console.log(`All ${files.length} file(s) already processed`);
    return;
  }

  console.log(`Found ${unprocessed.length} new file(s) to process`);

  let totalInserted = 0;
  let totalUpgraded = 0;
  let totalSkipped = 0;

  for (const file of unprocessed) {
    const result = await processFile(file);

    manifest.files[file.hash] = {
      filename: basename(file.path),
      processedAt: Date.now(),
      records: result.records,
      inserted: result.inserted,
      upgraded: result.upgraded,
      skipped: result.skipped,
      source: file.source,
    };

    saveManifest(manifest);

    totalInserted += result.inserted;
    totalUpgraded += result.upgraded;
    totalSkipped += result.skipped;
  }

  console.log(`\nComplete: ${totalInserted} inserted, ${totalUpgraded} upgraded, ${totalSkipped} unchanged`);
  db.close();
}

main().catch(console.error);
