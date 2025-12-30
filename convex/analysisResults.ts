import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByDate = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    return ctx.db
      .query("analysisResults")
      .withIndex("by_date", (q) => q.eq("date", date))
      .collect();
  },
});

export const getTrend = query({
  args: {
    category: v.string(),
    days: v.number(),
  },
  handler: async (ctx, { category, days }) => {
    const results = await ctx.db
      .query("analysisResults")
      .withIndex("by_category", (q) => q.eq("category", category))
      .order("desc")
      .take(days);

    return results.map((r) => ({
      date: r.date,
      count: r.antiPatterns.length,
      sevenDayAvg: r.sevenDayAvg,
    }));
  },
});

export const upsert = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("analysisResults")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .filter((q) => q.eq(q.field("date"), args.date))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    } else {
      return ctx.db.insert("analysisResults", args);
    }
  },
});
