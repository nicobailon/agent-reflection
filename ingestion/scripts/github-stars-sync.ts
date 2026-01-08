#!/usr/bin/env npx tsx
import { execSync } from "child_process";
import { db } from "./lib/db.js";

interface StarredRepo {
  node: {
    id: string;
    databaseId: number;
    nameWithOwner: string;
    owner: { login: string };
    name: string;
    description: string | null;
    primaryLanguage: { name: string } | null;
    languages: { nodes: Array<{ name: string }> };
    repositoryTopics: { nodes: Array<{ topic: { name: string } }> };
    licenseInfo: { spdxId: string } | null;
    stargazerCount: number;
    forkCount: number;
    openIssues: { totalCount: number };
    isArchived: boolean;
    isFork: boolean;
    isTemplate: boolean;
    createdAt: string;
    updatedAt: string;
    pushedAt: string;
  };
  starredAt: string;
}

const STARS_QUERY = `
query($cursor: String) {
  viewer {
    starredRepositories(first: 100, after: $cursor, orderBy: {field: STARRED_AT, direction: DESC}) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        starredAt
        node {
          id
          databaseId
          nameWithOwner
          owner { login }
          name
          description
          primaryLanguage { name }
          languages(first: 10) { nodes { name } }
          repositoryTopics(first: 20) { nodes { topic { name } } }
          licenseInfo { spdxId }
          stargazerCount
          forkCount
          openIssues: issues(states: OPEN) { totalCount }
          isArchived
          isFork
          isTemplate
          createdAt
          updatedAt
          pushedAt
        }
      }
    }
  }
}
`;

async function fetchPageWithRetry(cursor: string | null, maxRetries = 5): Promise<any> {
  const escapedQuery = STARS_QUERY.replace(/'/g, "'\\''");
  const cursorArg = cursor ? ` -f cursor='${cursor}'` : "";

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = execSync(`gh api graphql -f query='${escapedQuery}'${cursorArg}`, {
        encoding: "utf-8",
        maxBuffer: 50 * 1024 * 1024,
      });
      return JSON.parse(result);
    } catch (error: any) {
      const msg = (error.message || "") + (error.stderr || "");
      const isRateLimit = msg.includes("403") || msg.includes("rate limit");
      const isRetryable =
        msg.includes("502") ||
        msg.includes("503") ||
        msg.includes("stream error") ||
        msg.includes("CANCEL") ||
        msg.includes("timeout") ||
        isRateLimit;
      if (attempt < maxRetries && isRetryable) {
        const delay = isRateLimit ? 5 * 60 * 1000 : 2000 * attempt;
        console.log(`  ${isRateLimit ? "Rate limited, waiting 5 minutes" : "Retrying"} (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
}



function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS starred_repos (
      id TEXT PRIMARY KEY,
      github_id INTEGER UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      readme_content TEXT,
      readme_truncated INTEGER DEFAULT 0,
      primary_language TEXT,
      all_languages TEXT,
      topics TEXT,
      inferred_topics TEXT,
      license TEXT,
      stargazers_count INTEGER DEFAULT 0,
      forks_count INTEGER DEFAULT 0,
      open_issues_count INTEGER DEFAULT 0,
      starred_at INTEGER,
      created_at INTEGER,
      updated_at INTEGER,
      pushed_at INTEGER,
      is_archived INTEGER DEFAULT 0,
      is_fork INTEGER DEFAULT 0,
      is_template INTEGER DEFAULT 0,
      has_readme INTEGER DEFAULT 1,
      imported_at INTEGER,
      last_synced_at INTEGER,
      readme_fetched_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_stars_full_name ON starred_repos(full_name);
    CREATE INDEX IF NOT EXISTS idx_stars_owner ON starred_repos(owner);
    CREATE INDEX IF NOT EXISTS idx_stars_language ON starred_repos(primary_language);
    CREATE INDEX IF NOT EXISTS idx_stars_starred_at ON starred_repos(starred_at);
    CREATE INDEX IF NOT EXISTS idx_stars_stargazers ON starred_repos(stargazers_count);
  `);

  const hasFts = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='starred_repos_fts'").get();
  if (!hasFts) {
    db.exec(`
      CREATE VIRTUAL TABLE starred_repos_fts USING fts5(
        full_name,
        description,
        readme_content,
        topics,
        content='starred_repos',
        content_rowid='rowid'
      );

      CREATE TRIGGER starred_repos_ai AFTER INSERT ON starred_repos BEGIN
        INSERT INTO starred_repos_fts(rowid, full_name, description, readme_content, topics)
        VALUES (NEW.rowid, NEW.full_name, NEW.description, NEW.readme_content, NEW.topics);
      END;

      CREATE TRIGGER starred_repos_ad AFTER DELETE ON starred_repos BEGIN
        INSERT INTO starred_repos_fts(starred_repos_fts, rowid, full_name, description, readme_content, topics)
        VALUES ('delete', OLD.rowid, OLD.full_name, OLD.description, OLD.readme_content, OLD.topics);
      END;

      CREATE TRIGGER starred_repos_au AFTER UPDATE ON starred_repos BEGIN
        INSERT INTO starred_repos_fts(starred_repos_fts, rowid, full_name, description, readme_content, topics)
        VALUES ('delete', OLD.rowid, OLD.full_name, OLD.description, OLD.readme_content, OLD.topics);
        INSERT INTO starred_repos_fts(rowid, full_name, description, readme_content, topics)
        VALUES (NEW.rowid, NEW.full_name, NEW.description, NEW.readme_content, NEW.topics);
      END;
    `);
  }

  const hasVec = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='star_embeddings'").get();
  if (!hasVec) {
    db.exec(`
      CREATE VIRTUAL TABLE star_embeddings USING vec0(
        embedding float[1536] distance_metric=cosine
      );

      CREATE TABLE star_embedding_map (
        repo_id TEXT PRIMARY KEY,
        vec_rowid INTEGER NOT NULL
      );
      CREATE INDEX idx_star_embedding_map_rowid ON star_embedding_map(vec_rowid);
    `);
  }
}

function upsertRepos(stars: StarredRepo[]): { inserted: number; updated: number } {
  const countBefore = (db.prepare("SELECT COUNT(*) as c FROM starred_repos").get() as { c: number }).c;
  
  const upsert = db.prepare(`
    INSERT INTO starred_repos (
      id, github_id, full_name, owner, name, description,
      primary_language, all_languages, topics, license,
      stargazers_count, forks_count, open_issues_count,
      starred_at, created_at, updated_at, pushed_at,
      is_archived, is_fork, is_template, imported_at, last_synced_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    ) ON CONFLICT(github_id) DO UPDATE SET
      description = excluded.description,
      primary_language = excluded.primary_language,
      all_languages = excluded.all_languages,
      topics = excluded.topics,
      stargazers_count = excluded.stargazers_count,
      forks_count = excluded.forks_count,
      open_issues_count = excluded.open_issues_count,
      updated_at = excluded.updated_at,
      pushed_at = excluded.pushed_at,
      is_archived = excluded.is_archived,
      last_synced_at = excluded.last_synced_at
  `);

  const now = Date.now();

  const runBatch = db.transaction(() => {
    for (const star of stars) {
      const repo = star.node;
      upsert.run(
        repo.id,
        repo.databaseId,
        repo.nameWithOwner,
        repo.owner.login,
        repo.name,
        repo.description,
        repo.primaryLanguage?.name || null,
        JSON.stringify(repo.languages.nodes.map((l) => l.name)),
        JSON.stringify(repo.repositoryTopics.nodes.map((t) => t.topic.name)),
        repo.licenseInfo?.spdxId || null,
        repo.stargazerCount,
        repo.forkCount,
        repo.openIssues.totalCount,
        new Date(star.starredAt).getTime(),
        new Date(repo.createdAt).getTime(),
        new Date(repo.updatedAt).getTime(),
        new Date(repo.pushedAt).getTime(),
        repo.isArchived ? 1 : 0,
        repo.isFork ? 1 : 0,
        repo.isTemplate ? 1 : 0,
        now,
        now
      );
    }
  });

  runBatch();

  const countAfter = (db.prepare("SELECT COUNT(*) as c FROM starred_repos").get() as { c: number }).c;
  const inserted = countAfter - countBefore;
  const updated = stars.length - inserted;

  return { inserted, updated };
}

async function fetchAndSaveStars(): Promise<{ inserted: number; updated: number }> {
  let cursor: string | null = null;
  let page = 1;
  let totalInserted = 0;
  let totalUpdated = 0;

  while (true) {
    console.log(`Fetching page ${page}...`);

    const data = await fetchPageWithRetry(cursor);
    const repos = data.data.viewer.starredRepositories;

    const { inserted, updated } = upsertRepos(repos.edges);
    totalInserted += inserted;
    totalUpdated += updated;
    console.log(`  Got ${repos.edges.length} repos (+${inserted} new, ${updated} updated)`);

    if (!repos.pageInfo.hasNextPage) break;
    cursor = repos.pageInfo.endCursor;
    page++;

    await new Promise((r) => setTimeout(r, 2000));
  }

  return { inserted: totalInserted, updated: totalUpdated };
}

async function main() {
  ensureSchema();

  console.log("Fetching starred repos from GitHub...");
  const { inserted, updated } = await fetchAndSaveStars();

  const total = (db.prepare("SELECT COUNT(*) as count FROM starred_repos").get() as { count: number }).count;
  console.log(`Done! Total: ${total} repos (${inserted} inserted, ${updated} updated this run)`);
  db.close();
}

main().catch(console.error);
