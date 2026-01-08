import { db } from "./lib/db.js";
import { generateEmbeddings } from "./lib/embeddings.js";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, basename } from "path";
import { createHash } from "crypto";
import { homedir } from "os";

const YOUTUBE_DIR = process.env.YOUTUBE_DIR || `${homedir()}/data/agent-reflection/youtube`;
const MANIFEST_PATH = join(YOUTUBE_DIR, ".processed-sqlite.json");
const EMBEDDING_BATCH_SIZE = 100;

interface YTVideoFlat {
  id: string;
  title: string;
  description: string;
  channel: string;
  channel_id: string;
  channel_url: string;
  duration: number;
  view_count: number;
  upload_date: string;
  thumbnails: { url: string }[];
  tags: string[];
  url: string;
}

interface ProcessedFile {
  filename: string;
  processedAt: number;
  records: number;
  inserted: number;
  upgraded: number;
  skipped: number;
  source: "liked" | "watch_later";
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

function parseUploadDate(dateStr: string): string | null {
  if (!dateStr || dateStr.length !== 8) return null;
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  return `${year}-${month}-${day}`;
}

function inferSource(filename: string): "liked" | "watch_later" {
  if (filename.toLowerCase().includes("watch-later")) return "watch_later";
  return "liked";
}

type YouTubeFile = { path: string; hash: string; source: "liked" | "watch_later" };

function findYouTubeFiles(): YouTubeFile[] {
  if (!existsSync(YOUTUBE_DIR)) return [];

  return readdirSync(YOUTUBE_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("."))
    .map((f) => {
      const path = join(YOUTUBE_DIR, f);
      return {
        path,
        hash: computeHash(path),
        source: inferSource(f),
      };
    })
    .filter((f) => {
      try {
        const data = JSON.parse(readFileSync(f.path, "utf-8"));
        return Array.isArray(data) && data.length > 0 && data[0].id && data[0].title;
      } catch {
        return false;
      }
    });
}

function filterUnprocessedFiles(files: YouTubeFile[], manifest: Manifest): YouTubeFile[] {
  return files.filter((f) => !manifest.files[f.hash]);
}

function ensureEmbeddingTable(): void {
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='saved_video_embeddings'")
    .get();

  if (!tableExists) {
    db.exec("CREATE VIRTUAL TABLE saved_video_embeddings USING vec0(embedding float[1536] distance_metric=cosine)");
  }
}

async function processFile(
  file: YouTubeFile,
  savedAt: string
): Promise<{ records: number; inserted: number; upgraded: number; skipped: number }> {
  const batchFile = basename(file.path);
  console.log(`Processing ${batchFile} (source: ${file.source})...`);

  const content = readFileSync(file.path, "utf-8");
  const videos: YTVideoFlat[] = JSON.parse(content);

  const videosToEmbed: { video: YTVideoFlat; index: number }[] = [];
  const existingIds = new Set<string>();

  const findByVideoId = db.prepare("SELECT video_id, source FROM saved_videos WHERE video_id = ?");

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const existing = findByVideoId.get(v.id) as { video_id: string; source: string } | undefined;
    if (existing) {
      existingIds.add(v.id);
    } else {
      videosToEmbed.push({ video: v, index: i });
    }
  }

  console.log(`  ${videosToEmbed.length} new videos to embed, ${existingIds.size} existing`);

  const allEmbeddings: Map<number, number[]> = new Map();
  if (videosToEmbed.length > 0) {
    for (let i = 0; i < videosToEmbed.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = videosToEmbed.slice(i, i + EMBEDDING_BATCH_SIZE);
      const texts = batch.map(({ video: v }) => {
        const text = `${v.title || ""}\n\n${v.description || ""}`.trim().slice(0, 8000) || "[empty]";
        return text;
      });
      const embeddings = await generateEmbeddings(texts);
      batch.forEach(({ index }, j) => {
        allEmbeddings.set(index, embeddings[j]);
      });
      console.log(`  Embeddings: ${Math.min(i + EMBEDDING_BATCH_SIZE, videosToEmbed.length)}/${videosToEmbed.length}`);
    }
  }

  ensureEmbeddingTable();

  const insertVideo = db.prepare(`
    INSERT INTO saved_videos 
    (video_id, url, title, channel_name, channel_id, description, duration_seconds, 
     published_at, thumbnail_url, tags, view_count, source, saved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateSource = db.prepare("UPDATE saved_videos SET source = 'both', updated_at = CURRENT_TIMESTAMP WHERE video_id = ?");
  const insertEmbedding = db.prepare("INSERT INTO saved_video_embeddings (embedding) VALUES (?)");
  const insertEmbeddingMap = db.prepare("INSERT INTO saved_video_embedding_map (video_id, vec_rowid) VALUES (?, ?)");

  let inserted = 0;
  let upgraded = 0;
  let skipped = 0;

  const processAll = db.transaction(() => {
    for (let idx = 0; idx < videos.length; idx++) {
      const v = videos[idx];
      const existing = findByVideoId.get(v.id) as { video_id: string; source: string } | undefined;

      if (existing) {
        if (existing.source !== file.source && existing.source !== "both") {
          updateSource.run(v.id);
          upgraded++;
        } else {
          skipped++;
        }
        continue;
      }

      const thumbnail = v.thumbnails?.[0]?.url || null;
      const tags = v.tags ? JSON.stringify(v.tags) : null;
      const publishedAt = parseUploadDate(v.upload_date);
      const url = v.url || `https://www.youtube.com/watch?v=${v.id}`;

      insertVideo.run(
        v.id,
        url,
        v.title || "",
        v.channel || null,
        v.channel_id || null,
        v.description || null,
        v.duration || null,
        publishedAt,
        thumbnail,
        tags,
        v.view_count || null,
        file.source,
        savedAt
      );

      const embedding = allEmbeddings.get(idx);
      if (embedding) {
        const result = insertEmbedding.run(new Float32Array(embedding));
        const vecRowid = Number(result.lastInsertRowid);
        insertEmbeddingMap.run(v.id, vecRowid);
      }

      inserted++;
    }
  });

  processAll();

  console.log(`  ${inserted} inserted, ${upgraded} upgraded, ${skipped} unchanged`);

  return { records: videos.length, inserted, upgraded, skipped };
}

async function main() {
  const files = findYouTubeFiles();

  if (files.length === 0) {
    console.log(`No YouTube files found in ${YOUTUBE_DIR}`);
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
    const dateMatch = basename(file.path).match(/(\d{4}-\d{2}-\d{2})/);
    const savedAt = dateMatch ? dateMatch[1] : new Date().toISOString().split("T")[0];

    const result = await processFile(file, savedAt);

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
