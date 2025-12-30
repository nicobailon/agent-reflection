import { ConvexHttpClient } from "convex/browser";
import { execSync } from "child_process";
import { api } from "../../convex/_generated/api.js";

const CONVEX_URL = process.env.CONVEX_URL;
if (!CONVEX_URL) {
  console.error("CONVEX_URL environment variable required");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);

interface GitHubEvent {
  id: string;
  type: string;
  repo: { name: string };
  created_at: string;
  payload: any;
}

async function fetchGitHubEvents(): Promise<GitHubEvent[]> {
  try {
    const output = execSync(
      'gh api /users/nicobailon/events --paginate',
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
    );
    return JSON.parse(output);
  } catch (error) {
    console.error("Failed to fetch GitHub events:", error);
    return [];
  }
}

async function checkRepoVisibility(repoFullName: string): Promise<boolean> {
  try {
    const output = execSync(
      `gh api /repos/${repoFullName} --jq '.private'`,
      { encoding: "utf-8" }
    );
    return output.trim() === "false";
  } catch {
    return false;
  }
}

function transformEvent(event: GitHubEvent, isPublic: boolean): any | null {
  const timestamp = new Date(event.created_at).getTime();
  const date = event.created_at.split("T")[0];
  const repoFullName = event.repo.name;

  switch (event.type) {
    case "PushEvent": {
      const commits = event.payload?.commits || [];
      return commits.map((commit: any) => ({
        type: "commit",
        timestamp,
        date,
        source: "github",
        sourceId: `github:commit:${commit.sha}`,
        project: repoFullName.split("/")[1],
        repoFullName,
        isPublic,
        payload: {
          sha: commit.sha,
          message: commit.message.split("\n")[0],
          url: `https://github.com/${repoFullName}/commit/${commit.sha}`,
          filesChanged: 0,
          additions: 0,
          deletions: 0,
        },
      }));
    }

    case "IssuesEvent": {
      const issue = event.payload?.issue;
      const action = event.payload?.action;
      if (!issue || (action !== "opened" && action !== "closed")) return null;

      return {
        type: action === "opened" ? "issue_opened" : "issue_closed",
        timestamp,
        date,
        source: "github",
        sourceId: `github:issue:${issue.id}:${action}`,
        project: repoFullName.split("/")[1],
        repoFullName,
        isPublic,
        payload: {
          number: issue.number,
          title: issue.title,
          state: issue.state,
          url: issue.html_url,
          labels: (issue.labels || []).map((l: any) => l.name),
        },
      };
    }

    case "PullRequestEvent": {
      const pr = event.payload?.pull_request;
      const action = event.payload?.action;
      if (!pr) return null;

      let type = "pr_opened";
      if (action === "closed" && pr.merged) type = "pr_merged";
      else if (action === "closed") return null;
      else if (action !== "opened") return null;

      return {
        type,
        timestamp,
        date,
        source: "github",
        sourceId: `github:pr:${pr.id}:${action}`,
        project: repoFullName.split("/")[1],
        repoFullName,
        isPublic,
        payload: {
          number: pr.number,
          title: pr.title,
          state: pr.state,
          url: pr.html_url,
          additions: pr.additions || 0,
          deletions: pr.deletions || 0,
          filesChanged: pr.changed_files || 0,
        },
      };
    }

    default:
      return null;
  }
}

async function main() {
  console.log("Fetching GitHub events...");
  const events = await fetchGitHubEvents();
  console.log(`Found ${events.length} events`);

  const repoVisibilityCache = new Map<string, boolean>();

  const activities: any[] = [];

  for (const event of events) {
    const repoFullName = event.repo.name;

    if (!repoVisibilityCache.has(repoFullName)) {
      const isPublic = await checkRepoVisibility(repoFullName);
      repoVisibilityCache.set(repoFullName, isPublic);
    }

    const isPublic = repoVisibilityCache.get(repoFullName)!;
    const transformed = transformEvent(event, isPublic);

    if (transformed) {
      if (Array.isArray(transformed)) {
        activities.push(...transformed);
      } else {
        activities.push(transformed);
      }
    }
  }

  console.log(`Transformed to ${activities.length} activities`);

  if (activities.length > 0) {
    const result = await client.mutation(api.activities.batchInsert, { activities });
    console.log(`Inserted ${result.inserted}, skipped ${result.skipped} duplicates`);
  }

  console.log("GitHub ingestion complete");
}

main().catch(console.error);
