import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  activities: defineTable({
    type: v.string(),
    timestamp: v.number(),
    date: v.string(),
    source: v.string(),
    sourceId: v.string(),
    project: v.optional(v.string()),
    workspace: v.optional(v.string()),
    repoFullName: v.optional(v.string()),
    isPublic: v.boolean(),
    payload: v.any(),
  })
    .index("by_date", ["date"])
    .index("by_source", ["source", "timestamp"])
    .index("by_project", ["project", "timestamp"])
    .index("by_type", ["type", "timestamp"])
    .index("by_sourceId", ["sourceId"]),

  analysisResults: defineTable({
    date: v.string(),
    category: v.string(),
    categoryDisplay: v.string(),
    antiPatterns: v.array(v.any()),
    wins: v.array(v.any()),
    summary: v.string(),
    cassHits: v.number(),
    docHits: v.number(),
    sevenDayAvg: v.number(),
    delta: v.number(),
  })
    .index("by_date", ["date"])
    .index("by_category", ["category", "date"]),

  dailySummaries: defineTable({
    date: v.string(),
    totalSessions: v.number(),
    totalCommits: v.number(),
    totalIssuesClosed: v.number(),
    totalPRsMerged: v.number(),
    docsCreated: v.number(),
    docsModified: v.number(),
    bookmarksAdded: v.number(),
    estimatedMinutes: v.number(),
    antiPatternCount: v.number(),
    winCount: v.number(),
    topIssueCategory: v.optional(v.string()),
    projects: v.array(v.object({
      name: v.string(),
      workspace: v.optional(v.string()),
      repoFullName: v.optional(v.string()),
      sessionCount: v.number(),
      commitCount: v.number(),
      filesModified: v.array(v.string()),
      estimatedMinutes: v.number(),
      isPublic: v.boolean(),
    })),
    worklogMarkdown: v.optional(v.string()),
    blogDraft: v.optional(v.string()),
    blogDraftStatus: v.union(
      v.literal("pending"),
      v.literal("generated"),
      v.literal("reviewed"),
      v.literal("published")
    ),
  })
    .index("by_date", ["date"]),

  projects: defineTable({
    name: v.string(),
    workspaces: v.array(v.string()),
    repoFullName: v.optional(v.string()),
    description: v.optional(v.string()),
    isPublic: v.boolean(),
    isArchived: v.boolean(),
    totalSessions: v.number(),
    totalCommits: v.number(),
    totalTimeMinutes: v.number(),
    firstActivity: v.number(),
    lastActivity: v.number(),
    antiPatternCounts: v.any(),
  })
    .index("by_name", ["name"])
    .index("by_repo", ["repoFullName"]),

  bookmarks: defineTable({
    postUrl: v.string(),
    authorName: v.string(),
    authorHandle: v.string(),
    tweetText: v.string(),
    timestamp: v.number(),
    extractedLinks: v.array(v.string()),
    extractedRepos: v.array(v.string()),
    topics: v.array(v.string()),
    importedAt: v.number(),
    batchFile: v.string(),
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_author", ["authorHandle", "timestamp"])
    .index("by_postUrl", ["postUrl"]),

  dayActivities: defineTable({
    date: v.string(),
    level: v.number(),
    sessions: v.number(),
    commits: v.number(),
    issuesClosed: v.number(),
    prsMerged: v.number(),
    estimatedMinutes: v.number(),
  })
    .index("by_date", ["date"]),

  blogDrafts: defineTable({
    weekStart: v.string(),
    weekEnd: v.string(),
    content: v.string(),
    status: v.union(
      v.literal("pending_review"),
      v.literal("reviewed"),
      v.literal("published")
    ),
    createdAt: v.number(),
    publishedAt: v.optional(v.number()),
  })
    .index("by_week", ["weekStart"])
    .index("by_status", ["status"]),
});
