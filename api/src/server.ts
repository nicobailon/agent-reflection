import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { randomUUID } from "crypto";
import { homedir } from "os";

const dbPath = process.env.DB_PATH || `${homedir()}/data/agent-reflection/reflection.db`;
const db = new Database(dbPath);
sqliteVec.load(db);

const app = new Hono();
app.use("/*", cors());

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function toClient(row: Record<string, unknown>, jsonFields: string[] = []): Record<string, unknown> {
  if (!row) return row;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = snakeToCamel(key);
    if (jsonFields.includes(key) && typeof value === "string") {
      try {
        result[camelKey] = JSON.parse(value);
      } catch {
        result[camelKey] = value;
      }
    } else {
      result[camelKey] = value;
    }
  }
  if (result.id && !result._id) {
    result._id = result.id;
  }
  return result;
}

function toBookmarkClient(row: Record<string, unknown>): Record<string, unknown> {
  if (!row) return row;
  const base = toClient(row, ["extracted_links", "extracted_repos", "topics"]);

  base.interaction = {
    bookmarks: row.interaction_bookmarks || 0,
    likes: row.interaction_likes || 0,
    replies: row.interaction_replies || 0,
    reposts: row.interaction_reposts || 0,
    views: row.interaction_views || 0,
  };

  delete base.interactionBookmarks;
  delete base.interactionLikes;
  delete base.interactionReplies;
  delete base.interactionReposts;
  delete base.interactionViews;

  return base;
}

async function generateEmbedding(text: string): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }
  const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
  if (!data.data?.[0]?.embedding) {
    throw new Error("Invalid response from OpenAI");
  }
  return data.data[0].embedding;
}

app.get("/api/activities", (c) => {
  const limit = Number(c.req.query("limit")) || 50;
  const project = c.req.query("project");
  const publicOnly = c.req.query("publicOnly") === "true";
  const type = c.req.query("type");

  let query = "SELECT * FROM activities WHERE 1=1";
  const params: (string | number)[] = [];

  if (publicOnly) {
    query += " AND is_public = 1";
  }
  if (project) {
    query += " AND project = ?";
    params.push(project);
  }
  if (type) {
    query += " AND type = ?";
    params.push(type);
  }

  query += " ORDER BY timestamp DESC LIMIT ?";
  params.push(limit);

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
  return c.json(rows.map((r) => toClient(r, ["payload"])));
});

app.get("/api/activities/by-date/:date", (c) => {
  const { date } = c.req.param();
  const rows = db
    .prepare("SELECT * FROM activities WHERE date = ? ORDER BY timestamp DESC")
    .all(date) as Record<string, unknown>[];
  return c.json(rows.map((r) => toClient(r, ["payload"])));
});

app.get("/api/day-activities", (c) => {
  const startDate = c.req.query("startDate") || "2020-01-01";
  const endDate = c.req.query("endDate") || "2030-12-31";

  const rows = db
    .prepare(
      `
    SELECT * FROM day_activities 
    WHERE date BETWEEN ? AND ?
    ORDER BY date
  `
    )
    .all(startDate, endDate) as Array<{
    date: string;
    level: number;
    sessions: number;
    commits: number;
    issues_closed: number;
    prs_merged: number;
    estimated_minutes: number;
  }>;

  return c.json(
    rows.map((r) => ({
      date: r.date,
      level: r.level,
      sessions: r.sessions,
      commits: r.commits,
      issuesClosed: r.issues_closed,
      prsMerged: r.prs_merged,
      estimatedMinutes: r.estimated_minutes,
    }))
  );
});

app.get("/api/bookmarks", (c) => {
  const limit = Number(c.req.query("limit")) || 50;
  const author = c.req.query("author");
  const topic = c.req.query("topic");
  const query = c.req.query("query");
  const source = c.req.query("source");

  let sql = "SELECT * FROM bookmarks WHERE 1=1";
  const params: (string | number)[] = [];

  if (author) {
    sql += " AND LOWER(author_handle) = LOWER(?)";
    params.push(author);
  }

  if (source) {
    sql += " AND source = ?";
    params.push(source);
  }

  sql += " ORDER BY timestamp DESC LIMIT ?";
  params.push(limit);

  let rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

  if (query) {
    const q = query.toLowerCase();
    rows = rows.filter(
      (r) =>
        (r.tweet_text as string)?.toLowerCase().includes(q) ||
        (r.author_handle as string)?.toLowerCase().includes(q)
    );
  }
  if (topic) {
    rows = rows.filter((r) => {
      const topics = JSON.parse((r.topics as string) || "[]") as string[];
      return topics.includes(topic);
    });
  }

  return c.json(rows.map((r) => toBookmarkClient(r)));
});

app.get("/api/bookmarks/search", (c) => {
  const q = c.req.query("q") || "";
  const limit = Number(c.req.query("limit")) || 20;

  if (!q) {
    const rows = db
      .prepare("SELECT * FROM bookmarks ORDER BY timestamp DESC LIMIT ?")
      .all(limit) as Record<string, unknown>[];
    return c.json(rows.map((r) => toBookmarkClient(r)));
  }

  const rows = db
    .prepare(
      `
    SELECT b.* FROM bookmarks b
    JOIN bookmarks_fts fts ON b.rowid = fts.rowid
    WHERE bookmarks_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `
    )
    .all(q, limit) as Record<string, unknown>[];

  return c.json(rows.map((r) => toBookmarkClient(r)));
});

app.get("/api/bookmarks/topics", (c) => {
  const rows = db.prepare("SELECT topics FROM bookmarks").all() as Array<{ topics: string }>;
  const topicCounts = new Map<string, number>();

  for (const b of rows) {
    const topics = JSON.parse(b.topics || "[]") as string[];
    for (const topic of topics) {
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    }
  }

  const result = Array.from(topicCounts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);

  return c.json(result);
});

app.post("/api/bookmarks/semantic", async (c) => {
  const body = (await c.req.json()) as { query: string; author?: string; limit?: number };
  const { query, author, limit = 10 } = body;

  const embedding = await generateEmbedding(query);
  const queryVec = new Float32Array(embedding);

  const vecResults = db
    .prepare(
      `
    SELECT rowid, distance 
    FROM bookmark_embeddings 
    WHERE embedding MATCH ?
    ORDER BY distance 
    LIMIT ?
  `
    )
    .all(queryVec, limit * 2) as Array<{ rowid: number; distance: number }>;

  if (vecResults.length === 0) {
    return c.json([]);
  }

  const rowids = vecResults.map((r) => r.rowid);
  const distanceMap = new Map(vecResults.map((r) => [r.rowid, r.distance]));

  const placeholders = rowids.map(() => "?").join(",");
  let sql = `
    SELECT b.*, m.vec_rowid
    FROM bookmarks b
    JOIN bookmark_embedding_map m ON b.id = m.bookmark_id
    WHERE m.vec_rowid IN (${placeholders})
  `;
  const params: (string | number)[] = [...rowids];

  if (author) {
    sql += " AND LOWER(b.author_handle) = LOWER(?)";
    params.push(author);
  }

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown> & { vec_rowid: number }>;

  const results = rows
    .map((r) => ({ ...r, distance: distanceMap.get(r.vec_rowid) }))
    .sort((a, b) => (a.distance || 0) - (b.distance || 0))
    .slice(0, limit);

  return c.json(results.map((r) => ({ ...toBookmarkClient(r), _score: 1 - (r.distance || 0) })));
});

app.post("/api/bookmarks/similar", async (c) => {
  const body = (await c.req.json()) as { postUrl: string; limit?: number };
  const { postUrl, limit = 10 } = body;

  const mapping = db
    .prepare(
      `
    SELECT m.vec_rowid
    FROM bookmarks b
    JOIN bookmark_embedding_map m ON b.id = m.bookmark_id
    WHERE b.post_url = ?
  `
    )
    .get(postUrl) as { vec_rowid: number } | undefined;

  if (!mapping) {
    return c.json([]);
  }

  const embeddingRow = db
    .prepare(`SELECT embedding FROM bookmark_embeddings WHERE rowid = ?`)
    .get(mapping.vec_rowid) as { embedding: Float32Array } | undefined;

  if (!embeddingRow) {
    return c.json([]);
  }

  const vecResults = db
    .prepare(
      `
    SELECT rowid, distance 
    FROM bookmark_embeddings 
    WHERE embedding MATCH ?
    ORDER BY distance 
    LIMIT ?
  `
    )
    .all(embeddingRow.embedding, limit + 1) as Array<{ rowid: number; distance: number }>;

  const rowids = vecResults
    .filter((r) => r.rowid !== mapping.vec_rowid)
    .map((r) => r.rowid)
    .slice(0, limit);
  const distanceMap = new Map(vecResults.map((r) => [r.rowid, r.distance]));

  if (rowids.length === 0) {
    return c.json([]);
  }

  const placeholders = rowids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `
    SELECT b.*, m.vec_rowid
    FROM bookmarks b
    JOIN bookmark_embedding_map m ON b.id = m.bookmark_id
    WHERE m.vec_rowid IN (${placeholders})
  `
    )
    .all(...rowids) as Array<Record<string, unknown> & { vec_rowid: number }>;

  const results = rows
    .map((r) => ({ ...r, distance: distanceMap.get(r.vec_rowid) }))
    .sort((a, b) => (a.distance || 0) - (b.distance || 0));

  return c.json(results.map((r) => ({ ...toBookmarkClient(r), _score: 1 - (r.distance || 0) })));
});

app.get("/api/bookmarks/stats", (c) => {
  const total = (db.prepare("SELECT COUNT(*) as count FROM bookmarks").get() as { count: number }).count;
  const withEmbeddings = (db.prepare("SELECT COUNT(*) as count FROM bookmark_embeddings").get() as { count: number })
    .count;

  const sourceStats = db
    .prepare(`SELECT source, COUNT(*) as count FROM bookmarks GROUP BY source`)
    .all() as Array<{ source: string; count: number }>;

  const sample = db
    .prepare("SELECT * FROM bookmarks ORDER BY timestamp DESC LIMIT 1000")
    .all() as Array<Record<string, unknown>>;

  const topicCounts = new Map<string, number>();
  const authorCounts = new Map<string, number>();
  let totalViews = 0;
  let totalLikes = 0;
  let minTs = Infinity;
  let maxTs = 0;

  for (const b of sample) {
    const topics = JSON.parse((b.topics as string) || "[]") as string[];
    for (const topic of topics) {
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    }
    authorCounts.set(
      b.author_handle as string,
      (authorCounts.get(b.author_handle as string) || 0) + 1
    );
    totalViews += (b.interaction_views as number) || 0;
    totalLikes += (b.interaction_likes as number) || 0;
    if (b.timestamp) {
      minTs = Math.min(minTs, b.timestamp as number);
      maxTs = Math.max(maxTs, b.timestamp as number);
    }
  }

  const topTopics = Array.from(topicCounts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topAuthors = Array.from(authorCounts.entries())
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const dateRange =
    sample.length > 0
      ? {
          earliest: new Date(minTs).toISOString(),
          latest: new Date(maxTs).toISOString(),
        }
      : null;

  return c.json({
    total,
    withEmbeddings,
    topTopics,
    topAuthors,
    totalViews,
    totalLikes,
    dateRange,
    sampleNote: "Stats based on latest 1000 tweets",
    sourceBreakdown: sourceStats,
  });
});

app.get("/api/blog-drafts", (c) => {
  const status = c.req.query("status");
  let sql = "SELECT * FROM blog_drafts";
  const params: string[] = [];

  if (status) {
    sql += " WHERE status = ?";
    params.push(status);
  }

  sql += " ORDER BY week_start DESC";
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return c.json(rows.map((r) => toClient(r)));
});

app.get("/api/blog-drafts/by-week/:weekStart", (c) => {
  const { weekStart } = c.req.param();
  const row = db.prepare("SELECT * FROM blog_drafts WHERE week_start = ?").get(weekStart) as Record<
    string,
    unknown
  > | null;
  return c.json(toClient(row as Record<string, unknown>));
});

app.post("/api/blog-drafts", async (c) => {
  const draft = (await c.req.json()) as {
    weekStart: string;
    weekEnd: string;
    content: string;
    status?: string;
  };

  const existing = db.prepare("SELECT id FROM blog_drafts WHERE week_start = ?").get(draft.weekStart) as {
    id: string;
  } | null;

  if (existing) {
    db.prepare(`UPDATE blog_drafts SET content = ?, status = ?, created_at = ? WHERE week_start = ?`).run(
      draft.content,
      draft.status || "pending_review",
      Date.now(),
      draft.weekStart
    );
    return c.json({ id: existing.id, success: true });
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO blog_drafts (id, week_start, week_end, content, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, draft.weekStart, draft.weekEnd, draft.content, draft.status || "pending_review", Date.now());
  return c.json({ id, success: true });
});

app.patch("/api/blog-drafts/by-week/:weekStart", async (c) => {
  const { weekStart } = c.req.param();
  const { status } = (await c.req.json()) as { status: string };

  const publishedAt = status === "published" ? Date.now() : null;
  db.prepare(`UPDATE blog_drafts SET status = ?, published_at = COALESCE(?, published_at) WHERE week_start = ?`).run(
    status,
    publishedAt,
    weekStart
  );

  return c.json({ success: true });
});

app.get("/api/projects", (c) => {
  const includeArchived = c.req.query("includeArchived") === "true";
  let rows = db
    .prepare("SELECT * FROM projects ORDER BY last_activity DESC")
    .all() as Array<Record<string, unknown>>;
  if (!includeArchived) {
    rows = rows.filter((r) => !r.is_archived);
  }
  return c.json(rows.map((r) => toClient(r, ["workspaces", "anti_pattern_counts"])));
});

app.get("/api/projects/:name", (c) => {
  const { name } = c.req.param();
  const row = db.prepare("SELECT * FROM projects WHERE name = ?").get(name) as Record<string, unknown> | null;
  return c.json(toClient(row as Record<string, unknown>, ["workspaces", "anti_pattern_counts"]));
});

app.get("/api/analysis-results", (c) => {
  const date = c.req.query("date");
  const category = c.req.query("category");

  let sql = "SELECT * FROM analysis_results WHERE 1=1";
  const params: string[] = [];

  if (date) {
    sql += " AND date = ?";
    params.push(date);
  }
  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }

  sql += " ORDER BY date DESC";
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return c.json(rows.map((r) => toClient(r, ["anti_patterns", "wins"])));
});

app.get("/api/analysis-results/trend", (c) => {
  const category = c.req.query("category");
  const days = Number(c.req.query("days")) || 30;

  if (!category) {
    return c.json({ error: "category required" }, 400);
  }

  const rows = db
    .prepare(
      `
    SELECT date, anti_patterns, seven_day_avg
    FROM analysis_results
    WHERE category = ?
    ORDER BY date DESC
    LIMIT ?
  `
    )
    .all(category, days) as Array<{ date: string; anti_patterns: string; seven_day_avg: number }>;

  return c.json(
    rows.map((r) => ({
      date: r.date,
      count: (JSON.parse(r.anti_patterns || "[]") as unknown[]).length,
      sevenDayAvg: r.seven_day_avg,
    }))
  );
});

app.get("/api/daily-summaries", (c) => {
  const date = c.req.query("date");
  const limit = Number(c.req.query("limit")) || 30;

  let sql = "SELECT * FROM daily_summaries";
  const params: (string | number)[] = [];

  if (date) {
    sql += " WHERE date = ?";
    params.push(date);
  }

  sql += " ORDER BY date DESC LIMIT ?";
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return c.json(rows.map((r) => toClient(r, ["projects"])));
});

app.get("/api/daily-summaries/by-date/:date", (c) => {
  const { date } = c.req.param();
  const row = db.prepare("SELECT * FROM daily_summaries WHERE date = ?").get(date) as Record<string, unknown> | null;
  return c.json(toClient(row as Record<string, unknown>, ["projects"]));
});

app.get("/api/stats", (c) => {
  const stats = {
    totalActivities: (db.prepare("SELECT COUNT(*) as count FROM activities").get() as { count: number }).count,
    totalBookmarks: (db.prepare("SELECT COUNT(*) as count FROM bookmarks").get() as { count: number }).count,
    totalDrafts: (db.prepare("SELECT COUNT(*) as count FROM blog_drafts").get() as { count: number }).count,
    totalProjects: (db.prepare("SELECT COUNT(*) as count FROM projects").get() as { count: number }).count,
    recentDays: db.prepare("SELECT * FROM day_activities ORDER BY date DESC LIMIT 7").all(),
  };
  return c.json(stats);
});

const port = Number(process.env.PORT) || 3001;
serve({ fetch: app.fetch, port });
console.log(`API server running on http://localhost:${port}`);
