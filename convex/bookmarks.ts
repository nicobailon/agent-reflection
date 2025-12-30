import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const search = query({
  args: {
    query: v.optional(v.string()),
    topic: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let bookmarks = await ctx.db
      .query("bookmarks")
      .withIndex("by_timestamp")
      .order("desc")
      .take(args.limit ?? 50);

    if (args.query) {
      const q = args.query.toLowerCase();
      bookmarks = bookmarks.filter(
        (b) =>
          b.tweetText.toLowerCase().includes(q) ||
          b.authorHandle.toLowerCase().includes(q)
      );
    }

    if (args.topic) {
      bookmarks = bookmarks.filter((b) => b.topics.includes(args.topic!));
    }

    return bookmarks;
  },
});

export const batchInsert = mutation({
  args: {
    bookmarks: v.array(v.object({
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
    })),
  },
  handler: async (ctx, { bookmarks }) => {
    let inserted = 0;
    for (const bookmark of bookmarks) {
      const existing = await ctx.db
        .query("bookmarks")
        .withIndex("by_postUrl", (q) => q.eq("postUrl", bookmark.postUrl))
        .first();

      if (!existing) {
        await ctx.db.insert("bookmarks", bookmark);
        inserted++;
      }
    }
    return { inserted, skipped: bookmarks.length - inserted };
  },
});

export const getTopics = query({
  handler: async (ctx) => {
    const bookmarks = await ctx.db.query("bookmarks").collect();
    const topicCounts = new Map<string, number>();

    for (const b of bookmarks) {
      for (const topic of b.topics) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      }
    }

    return Array.from(topicCounts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count);
  },
});
