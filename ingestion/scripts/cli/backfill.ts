import { db } from "../lib/db.js";
import { generateEmbeddings } from "../lib/embeddings.js";

function parseArgs(args: string[]): { batchSize: number; dryRun: boolean } {
  let batchSize = 100;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--batch" && args[i + 1]) {
      batchSize = parseInt(args[++i], 10);
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  return { batchSize, dryRun };
}

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

interface BookmarkWithoutEmbedding {
  id: string;
  post_url: string;
  tweet_text: string;
}

async function main() {
  const args = process.argv.slice(2);
  const { batchSize, dryRun } = parseArgs(args);

  console.log("Fetching tweets without embeddings...");

  const tweetsWithoutEmbeddings = db
    .prepare(
      `
    SELECT b.id, b.post_url, b.tweet_text
    FROM bookmarks b
    LEFT JOIN bookmark_embedding_map m ON b.id = m.bookmark_id
    WHERE m.bookmark_id IS NULL
    LIMIT ?
  `
    )
    .all(batchSize) as BookmarkWithoutEmbedding[];

  if (tweetsWithoutEmbeddings.length === 0) {
    console.log("All bookmarks have embeddings");
    return;
  }

  console.log(`Found ${tweetsWithoutEmbeddings.length} bookmarks without embeddings`);

  if (dryRun) {
    console.log("Dry run - no changes made");
    return;
  }

  const maxRowidResult = db.prepare("SELECT MAX(vec_rowid) as max FROM bookmark_embedding_map").get() as {
    max: number | null;
  };
  let nextRowid = (maxRowidResult?.max || 0) + 1;

  const insertEmbedding = db.prepare(`INSERT INTO bookmark_embeddings (rowid, embedding) VALUES (?, ?)`);
  const insertMap = db.prepare(`INSERT INTO bookmark_embedding_map (bookmark_id, vec_rowid) VALUES (?, ?)`);

  let processed = 0;

  for (const batch of chunks(tweetsWithoutEmbeddings, 100)) {
    const texts = batch.map((t) => t.tweet_text);
    const embeddings = await generateEmbeddings(texts);

    const insertMany = db.transaction(() => {
      for (let i = 0; i < batch.length; i++) {
        const embedding = new Float32Array(embeddings[i]);
        insertEmbedding.run(nextRowid, embedding);
        insertMap.run(batch[i].id, nextRowid);
        nextRowid++;
        processed++;
      }
    });

    insertMany();
    console.log(`Processed ${processed}/${tweetsWithoutEmbeddings.length}`);
  }

  console.log(`\nBackfill complete: ${processed} embeddings generated`);
}

main().catch(console.error);
