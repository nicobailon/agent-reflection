#!/usr/bin/env npx tsx
/**
 * Fetch READMEs for starred repos in small batches.
 * Designed to run periodically via launchd (e.g., every 4 hours).
 * 
 * Environment variables:
 *   BATCH_SIZE - repos per run (default: 15)
 *   DELAY_MS - delay between requests (default: 5000)
 */
import { execSync } from "child_process";
import { db } from "./lib/db.js";

const README_MAX_CHARS = 8000;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "45");
const DELAY_MS = parseInt(process.env.DELAY_MS || "4000");

async function main() {
  const pending = db.prepare(`
    SELECT COUNT(*) as count FROM starred_repos 
    WHERE readme_content IS NULL AND has_readme = 1
  `).get() as { count: number };

  if (pending.count === 0) {
    console.log("All READMEs fetched");
    db.close();
    return;
  }

  const repos = db.prepare(`
    SELECT id, full_name FROM starred_repos 
    WHERE readme_content IS NULL AND has_readme = 1
    ORDER BY starred_at DESC
    LIMIT ?
  `).all(BATCH_SIZE) as Array<{ id: string; full_name: string }>;

  console.log(`Fetching ${repos.length} of ${pending.count} pending READMEs...`);

  const updateReadme = db.prepare(`
    UPDATE starred_repos 
    SET readme_content = ?, readme_truncated = ?, readme_fetched_at = ?, has_readme = ?
    WHERE id = ?
  `);

  let fetched = 0, noReadme = 0;

  for (const repo of repos) {
    try {
      const result = execSync(
        `gh api repos/${repo.full_name}/readme --jq '.content' 2>/dev/null | base64 -d`,
        { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
      );

      const truncated = result.length > README_MAX_CHARS;
      const content = result.slice(0, README_MAX_CHARS);

      updateReadme.run(content, truncated ? 1 : 0, Date.now(), 1, repo.id);
      fetched++;
      console.log(`  + ${repo.full_name}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const is404 = msg.includes("404") || msg.includes("Not Found");
      updateReadme.run(null, 0, Date.now(), is404 ? 0 : 1, repo.id);
      noReadme++;
      console.log(`  - ${repo.full_name} (${is404 ? "no README" : `error: ${msg.slice(0, 50)}`})`);
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const remaining = pending.count - repos.length;
  console.log(`Done: ${fetched} fetched, ${noReadme} no README, ${remaining} remaining`);
  db.close();
}

main().catch(console.error);
