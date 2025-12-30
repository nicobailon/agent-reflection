import { ConvexHttpClient } from "convex/browser";
import { spawnSync } from "child_process";
import { api } from "../../convex/_generated/api.js";

const CONVEX_URL = process.env.CONVEX_URL;
if (!CONVEX_URL) {
  console.error("CONVEX_URL environment variable required");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);

function getWeekRange(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const end = new Date(now);
  end.setDate(now.getDate() - dayOfWeek);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);

  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

async function fetchWeekData(start: string, end: string) {
  const dayData = await client.query(api.dayActivities.getContributionGraph, {
    startDate: start,
    endDate: end,
  });

  const allActivities: any[] = [];
  const current = new Date(start);
  const endDate = new Date(end);

  while (current <= endDate) {
    const dateStr = current.toISOString().split("T")[0];
    const activities = await client.query(api.activities.getByDate, { date: dateStr });
    allActivities.push(...activities);
    current.setDate(current.getDate() + 1);
  }

  const bookmarks = await client.query(api.bookmarks.search, { limit: 10 });
  const recentBookmarks = bookmarks.filter(
    (b: any) => b.timestamp >= new Date(start).getTime()
  );

  return {
    dayData,
    activities: allActivities,
    bookmarks: recentBookmarks,
  };
}

function filterPublic<T extends { isPublic?: boolean }>(items: T[]): T[] {
  return items.filter((item) => item.isPublic !== false);
}

function buildPrompt(
  weekStart: string,
  weekEnd: string,
  data: { dayData: any[]; activities: any[]; bookmarks: any[] }
): string {
  const publicActivities = filterPublic(data.activities);

  const commits = publicActivities.filter((a) => a.type === "commit");
  const prsMerged = publicActivities.filter((a) => a.type === "pr_merged");
  const issuesClosed = publicActivities.filter((a) => a.type === "issue_closed");

  const projectSet = new Set(publicActivities.map((a) => a.project).filter(Boolean));
  const projects = Array.from(projectSet);

  const totalMinutes = data.dayData.reduce((sum, d) => sum + d.estimatedMinutes, 0);
  const totalHours = Math.round(totalMinutes / 60);

  const commitsList = commits
    .slice(0, 10)
    .map((c: any) => `- ${c.project}: ${c.payload?.message || "No message"}`)
    .join("\n");

  const prsList = prsMerged
    .map((pr: any) => `- ${pr.project}: ${pr.payload?.title || "PR"}`)
    .join("\n");

  const issuesList = issuesClosed
    .map((i: any) => `- ${i.project}: ${i.payload?.title || "Issue"}`)
    .join("\n");

  const bookmarksList = data.bookmarks
    .slice(0, 5)
    .map((b: any) => `- @${b.authorHandle}: "${b.tweetText.slice(0, 100)}..."`)
    .join("\n");

  return `Generate a weekly development digest in changelog style.

## Week of ${weekStart} to ${weekEnd}

### Stats
- Projects: ${projects.join(", ")}
- Commits: ${commits.length}
- PRs merged: ${prsMerged.length}
- Issues closed: ${issuesClosed.length}
- Estimated hours: ${totalHours}

### Recent Commits
${commitsList || "None"}

### PRs Merged
${prsList || "None"}

### Issues Closed
${issuesList || "None"}

### Interesting Bookmarks
${bookmarksList || "None this week"}

## Output Format

Write a casual, dev-blog style post with these sections:
- **Shipped**: What got done/merged
- **Fixed**: Bugs squashed, issues resolved
- **Reading**: Interesting links from bookmarks (if any)

Keep it concise and conversational. Include project names.
Output the markdown directly, no preamble or code fences.`;
}

async function main() {
  const { start, end } = getWeekRange();
  console.log(`Generating blog draft for ${start} to ${end}`);

  const data = await fetchWeekData(start, end);
  console.log(`Found ${data.activities.length} activities, ${data.bookmarks.length} bookmarks`);

  const prompt = buildPrompt(start, end, data);

  console.log("Calling LLM...");
  const result = spawnSync("pi", ["-p", prompt], {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    throw new Error(`Failed to run pi: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`pi exited with code ${result.status}: ${result.stderr}`);
  }

  const output = result.stdout;

  console.log("Storing draft in Convex...");
  await client.mutation(api.blogDrafts.create, {
    weekStart: start,
    weekEnd: end,
    content: output.trim(),
    status: "pending_review",
    createdAt: Date.now(),
  });

  console.log("Blog draft generated successfully");
  console.log("\n--- Preview ---\n");
  console.log(output.slice(0, 500) + "...");
}

main().catch(console.error);
