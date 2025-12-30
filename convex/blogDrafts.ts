import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    status: v.optional(v.string()),
  },
  handler: async (ctx, { status }) => {
    let drafts = await ctx.db
      .query("blogDrafts")
      .withIndex("by_week")
      .order("desc")
      .collect();

    if (status) {
      drafts = drafts.filter((d) => d.status === status);
    }

    return drafts;
  },
});

export const get = query({
  args: { weekStart: v.string() },
  handler: async (ctx, { weekStart }) => {
    return ctx.db
      .query("blogDrafts")
      .withIndex("by_week", (q) => q.eq("weekStart", weekStart))
      .first();
  },
});

export const create = mutation({
  args: {
    weekStart: v.string(),
    weekEnd: v.string(),
    content: v.string(),
    status: v.string(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("blogDrafts")
      .withIndex("by_week", (q) => q.eq("weekStart", args.weekStart))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        content: args.content,
        status: args.status as any,
        createdAt: args.createdAt,
      });
      return existing._id;
    }

    return ctx.db.insert("blogDrafts", args as any);
  },
});

export const updateStatus = mutation({
  args: {
    weekStart: v.string(),
    status: v.string(),
  },
  handler: async (ctx, { weekStart, status }) => {
    const draft = await ctx.db
      .query("blogDrafts")
      .withIndex("by_week", (q) => q.eq("weekStart", weekStart))
      .first();

    if (draft) {
      await ctx.db.patch(draft._id, {
        status: status as any,
        ...(status === "published" ? { publishedAt: Date.now() } : {}),
      });
    }
  },
});
