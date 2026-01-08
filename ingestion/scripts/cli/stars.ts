#!/usr/bin/env npx tsx
import { Command } from "commander";

const API_URL = process.env.AGENT_REFLECTION_API || "http://localhost:3001";

const program = new Command();

program.name("stars").description("Search and explore your GitHub starred repos").version("1.0.0");

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, options);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

interface StarredRepo {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  primaryLanguage: string | null;
  topics: string[];
  license: string | null;
  stargazersCount: number;
  forksCount: number;
  starredAt: number;
  isArchived: boolean;
  isFork: boolean;
  readmeContent: string | null;
  _score?: number;
}

function formatRepo(r: StarredRepo, verbose = false): string {
  const date = new Date(r.starredAt).toLocaleDateString();
  const lang = r.primaryLanguage || "?";
  const topics = (r.topics || []).slice(0, 3).join(", ");
  const stars = r.stargazersCount.toLocaleString();
  const scoreStr = r._score !== undefined ? ` (${(r._score * 100).toFixed(0)}%)` : "";
  const archived = r.isArchived ? " [ARCHIVED]" : "";
  const fork = r.isFork ? " [FORK]" : "";

  let output = `${r.fullName}${archived}${fork}${scoreStr}
   ${r.description || "(no description)"}
   ${lang} | ${stars} stars | ${r.license || "no license"} | ${date}`;

  if (topics) {
    output += `\n   [${topics}]`;
  }

  if (verbose && r.readmeContent) {
    output += `\n   README: ${r.readmeContent.slice(0, 200)}...`;
  }

  return output;
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
  .description("Semantic/vector search - find repos by meaning")
  .option("--lang <language>", "Filter by primary language")
  .option("--min-stars <n>", "Minimum star count")
  .option("-l, --limit <n>", "Max results", "10")
  .option("-j, --json", "Output as JSON")
  .action(async (query: string, opts) => {
    console.error("Searching...");
    const results = await api("/api/stars/semantic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        lang: opts.lang,
        minStars: opts.minStars ? parseInt(opts.minStars) : undefined,
        limit: parseInt(opts.limit),
      }),
    });
    output(results, opts.json, formatRepo);
  });

program
  .command("search <query>")
  .alias("f")
  .description("Full-text keyword search")
  .option("--lang <language>", "Filter by primary language")
  .option("--min-stars <n>", "Minimum star count")
  .option("-l, --limit <n>", "Max results", "20")
  .option("-j, --json", "Output as JSON")
  .action(async (query: string, opts) => {
    const params = new URLSearchParams({
      q: query,
      limit: opts.limit,
    });
    if (opts.lang) params.set("lang", opts.lang);
    if (opts.minStars) params.set("minStars", opts.minStars);

    const results = await api(`/api/stars/search?${params}`);
    output(results, opts.json, formatRepo);
  });

program
  .command("similar <repo>")
  .alias("sim")
  .description("Find repos similar to a given one (owner/name)")
  .option("-l, --limit <n>", "Max results", "10")
  .option("-j, --json", "Output as JSON")
  .action(async (repo: string, opts) => {
    console.error("Finding similar...");
    const results = await api("/api/stars/similar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: repo, limit: parseInt(opts.limit) }),
    });
    output(results, opts.json, formatRepo);
  });

program
  .command("get <repo>")
  .description("Get full details of a specific repo (owner/name)")
  .option("-j, --json", "Output as JSON")
  .action(async (repo: string, opts) => {
    const encodedRepo = repo.replace("/", "%2F");
    const result = (await api(`/api/stars/${encodedRepo}`)) as StarredRepo;

    if (!result || !result.id) {
      console.error("Repo not found in starred");
      process.exit(1);
    }

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`${result.fullName}${result.isArchived ? " [ARCHIVED]" : ""}`);
      console.log(`${result.description || "(no description)"}`);
      console.log("");
      console.log(`Language: ${result.primaryLanguage || "?"}`);
      console.log(`Stars: ${result.stargazersCount.toLocaleString()}`);
      console.log(`Forks: ${result.forksCount.toLocaleString()}`);
      console.log(`License: ${result.license || "none"}`);
      console.log(`Starred: ${new Date(result.starredAt).toLocaleDateString()}`);
      if (result.topics?.length) {
        console.log(`Topics: ${result.topics.join(", ")}`);
      }
      if (result.readmeContent) {
        console.log(`\n--- README (excerpt) ---\n${result.readmeContent.slice(0, 1000)}...`);
      }
    }
  });

program
  .command("list")
  .description("List starred repos")
  .option("--lang <language>", "Filter by primary language")
  .option("--min-stars <n>", "Minimum star count")
  .option("--license <license>", "Filter by license")
  .option("--archived", "Include archived repos only")
  .option("-l, --limit <n>", "Max results", "20")
  .option("-j, --json", "Output as JSON")
  .action(async (opts) => {
    const params = new URLSearchParams({ limit: opts.limit });
    if (opts.lang) params.set("lang", opts.lang);
    if (opts.minStars) params.set("minStars", opts.minStars);
    if (opts.license) params.set("license", opts.license);
    if (opts.archived) params.set("archived", "true");

    const results = await api(`/api/stars?${params}`);
    output(results, opts.json, formatRepo);
  });

program
  .command("recent")
  .description("Most recently starred repos")
  .option("-l, --limit <n>", "Number of repos", "10")
  .option("-j, --json", "Output as JSON")
  .action(async (opts) => {
    const params = new URLSearchParams({ limit: opts.limit });
    const results = await api(`/api/stars?${params}`);
    output(results, opts.json, formatRepo);
  });

program
  .command("stats")
  .description("Show statistics about your starred repos")
  .option("-j, --json", "Output as JSON")
  .action(async (opts) => {
    const stats = await api("/api/stars/stats");

    if (opts.json) {
      console.log(JSON.stringify(stats, null, 2));
    } else {
      console.log(`Total starred repos: ${stats.total.toLocaleString()}`);
      console.log(`With embeddings: ${stats.withEmbeddings.toLocaleString()}`);
      console.log(`With READMEs: ${stats.withReadme.toLocaleString()}`);
      console.log(`Archived: ${stats.archived.toLocaleString()}`);
      console.log("");
      console.log("Top languages:");
      stats.byLanguage?.slice(0, 10).forEach((l: any) => console.log(`  ${l.language}: ${l.count}`));
      console.log("");
      console.log("Top licenses:");
      stats.byLicense?.slice(0, 5).forEach((l: any) => console.log(`  ${l.license}: ${l.count}`));
    }
  });

program
  .command("languages")
  .description("List languages with counts")
  .option("-l, --limit <n>", "Max languages to show", "20")
  .option("-j, --json", "Output as JSON")
  .action(async (opts) => {
    const stats = await api("/api/stars/stats");
    const languages = stats.byLanguage?.slice(0, parseInt(opts.limit)) || [];

    if (opts.json) {
      console.log(JSON.stringify(languages, null, 2));
    } else {
      languages.forEach((l: any) => console.log(`${l.language}: ${l.count}`));
    }
  });

program
  .command("topics")
  .description("List topics with counts")
  .option("-l, --limit <n>", "Max topics to show", "20")
  .option("-j, --json", "Output as JSON")
  .action(async (opts) => {
    const results = await api(`/api/stars/topics?limit=${opts.limit}`);

    if (opts.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      results.forEach((t: any) => console.log(`${t.topic}: ${t.count}`));
    }
  });

program.parse(process.argv);
