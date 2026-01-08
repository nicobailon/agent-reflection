import { db } from "./lib/db.js";
import { generateEmbeddings } from "./lib/embeddings.js";
import { execSync } from "child_process";
import { readFileSync, unlinkSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { homedir } from "os";

const CONFIG_PATH = `${homedir()}/data/agent-reflection/config.json`;
const COOKIES_PATH = `${homedir()}/.config/youtube-sync/cookies.txt`;

interface Config {
  youtube: {
    transcriptChunkThresholdMinutes: number;
    transcriptChunkSizeSeconds: number;
  };
}

interface TranscriptSegment {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    return {
      youtube: {
        transcriptChunkThresholdMinutes: 15,
        transcriptChunkSizeSeconds: 180,
      },
    };
  }
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

function parseVTT(content: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const lines = content.split("\n");

  let currentStart = 0;
  let currentEnd = 0;
  let currentText = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    const timeMatch = line.match(/(\d{2}):(\d{2}):(\d{2})[\.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[\.,](\d{3})/);
    if (timeMatch) {
      if (currentText) {
        segments.push({ startSeconds: currentStart, endSeconds: currentEnd, text: currentText.trim() });
      }
      currentStart = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
      currentEnd = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]);
      currentText = "";
      continue;
    }

    if (line && !line.startsWith("WEBVTT") && !line.startsWith("Kind:") && !line.startsWith("Language:") && !line.match(/^\d+$/)) {
      const cleanedLine = line.replace(/<[^>]+>/g, "").trim();
      if (cleanedLine) {
        currentText += (currentText ? " " : "") + cleanedLine;
      }
    }
  }

  if (currentText) {
    segments.push({ startSeconds: currentStart, endSeconds: currentEnd, text: currentText.trim() });
  }

  return segments;
}

function chunkSegments(segments: TranscriptSegment[], chunkSizeSeconds: number): TranscriptSegment[] {
  if (segments.length === 0) return [];

  const chunks: TranscriptSegment[] = [];
  let currentChunk: TranscriptSegment = {
    startSeconds: segments[0].startSeconds,
    endSeconds: segments[0].endSeconds,
    text: "",
  };

  for (const seg of segments) {
    if (seg.startSeconds - currentChunk.startSeconds >= chunkSizeSeconds) {
      if (currentChunk.text) {
        chunks.push(currentChunk);
      }
      currentChunk = {
        startSeconds: seg.startSeconds,
        endSeconds: seg.endSeconds,
        text: seg.text,
      };
    } else {
      currentChunk.endSeconds = seg.endSeconds;
      currentChunk.text += (currentChunk.text ? " " : "") + seg.text;
    }
  }

  if (currentChunk.text) {
    chunks.push(currentChunk);
  }

  return chunks;
}

export async function fetchTranscript(videoId: string): Promise<{
  success: boolean;
  cached?: boolean;
  transcript?: string;
  segments?: number;
  error?: string;
}> {
  const video = db
    .prepare("SELECT video_id, duration_seconds, transcript, title, description FROM saved_videos WHERE video_id = ?")
    .get(videoId) as { video_id: string; duration_seconds: number | null; transcript: string | null; title: string; description: string | null } | undefined;

  if (!video) {
    return { success: false, error: "Video not found in database" };
  }

  if (video.transcript) {
    return { success: true, cached: true, transcript: video.transcript };
  }

  const config = loadConfig();
  const thresholdSeconds = config.youtube.transcriptChunkThresholdMinutes * 60;
  const chunkSize = config.youtube.transcriptChunkSizeSeconds;

  const tempDir = tmpdir();
  const outputTemplate = join(tempDir, `yt-${videoId}`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const cookiesArg = existsSync(COOKIES_PATH) ? `--cookies "${COOKIES_PATH}"` : "";

    execSync(
      `yt-dlp ${cookiesArg} --write-auto-sub --sub-lang en --skip-download --sub-format vtt -o "${outputTemplate}" "${url}"`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
  } catch (e) {
    return { success: false, error: "Failed to fetch subtitles (may not be available)" };
  }

  const subFiles = readdirSync(tempDir).filter((f) => f.startsWith(`yt-${videoId}`) && f.endsWith(".vtt"));
  if (subFiles.length === 0) {
    return { success: false, error: "No English subtitles available" };
  }

  const subPath = join(tempDir, subFiles[0]);
  const vttContent = readFileSync(subPath, "utf-8");
  unlinkSync(subPath);

  const rawSegments = parseVTT(vttContent);
  if (rawSegments.length === 0) {
    return { success: false, error: "Could not parse subtitles" };
  }

  const fullTranscript = rawSegments.map((s) => s.text).join(" ");

  const duration = video.duration_seconds || 0;
  const shouldChunk = duration > thresholdSeconds;

  let segmentCount = 0;

  if (shouldChunk) {
    const chunks = chunkSegments(rawSegments, chunkSize);
    segmentCount = chunks.length;

    const insertSegment = db.prepare(`
      INSERT INTO saved_video_segments (video_id, segment_index, start_seconds, end_seconds, text)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertAll = db.transaction(() => {
      db.prepare("DELETE FROM saved_video_segments WHERE video_id = ?").run(videoId);
      chunks.forEach((chunk, idx) => {
        insertSegment.run(videoId, idx, chunk.startSeconds, chunk.endSeconds, chunk.text);
      });
    });

    insertAll();
  }

  db.prepare(`
    UPDATE saved_videos 
    SET transcript = ?, transcript_fetched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE video_id = ?
  `).run(fullTranscript, videoId);

  const embeddingText = `${video.title || ""}\n\n${video.description || ""}\n\n${fullTranscript}`.trim().slice(0, 8000);
  const [embedding] = await generateEmbeddings([embeddingText]);

  const existingMap = db.prepare("SELECT vec_rowid FROM saved_video_embedding_map WHERE video_id = ?").get(videoId) as { vec_rowid: number } | undefined;

  if (existingMap) {
    db.prepare("UPDATE saved_video_embeddings SET embedding = ? WHERE rowid = ?").run(
      new Float32Array(embedding),
      existingMap.vec_rowid
    );
  } else {
    const result = db.prepare("INSERT INTO saved_video_embeddings (embedding) VALUES (?)").run(new Float32Array(embedding));
    db.prepare("INSERT INTO saved_video_embedding_map (video_id, vec_rowid) VALUES (?, ?)").run(
      videoId,
      Number(result.lastInsertRowid)
    );
  }

  return {
    success: true,
    transcript: fullTranscript,
    segments: shouldChunk ? segmentCount : undefined,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const videoId = process.argv[2];
  if (!videoId) {
    console.error("Usage: npx tsx youtube-transcript-fetch.ts <videoId>");
    process.exit(1);
  }

  fetchTranscript(videoId)
    .then((result) => {
      if (result.success) {
        console.log(result.cached ? "Transcript already cached" : "Transcript fetched and stored");
        console.log(`Length: ${result.transcript?.length || 0} characters`);
        if (result.segments) {
          console.log(`Segments: ${result.segments}`);
        }
      } else {
        console.error(`Error: ${result.error}`);
        process.exit(1);
      }
      db.close();
    })
    .catch((e) => {
      console.error(e);
      db.close();
      process.exit(1);
    });
}
