import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getContributionGraph = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, { startDate, endDate }) => {
    const allDays = await ctx.db
      .query("dayActivities")
      .withIndex("by_date")
      .collect();

    return allDays.filter(
      (day) => day.date >= startDate && day.date <= endDate
    );
  },
});

export const upsertDay = mutation({
  args: {
    date: v.string(),
    level: v.number(),
    sessions: v.number(),
    commits: v.number(),
    issuesClosed: v.number(),
    prsMerged: v.number(),
    estimatedMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dayActivities")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    } else {
      return ctx.db.insert("dayActivities", args);
    }
  },
});

export const recalculateDay = mutation({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_date", (q) => q.eq("date", date))
      .collect();

    const sessions = activities.filter((a) => a.source === "cass").length;
    const commits = activities.filter((a) => a.type === "commit").length;
    const issuesClosed = activities.filter((a) => a.type === "issue_closed").length;
    const prsMerged = activities.filter((a) => a.type === "pr_merged").length;

    const totalActivity = sessions + commits + issuesClosed + prsMerged;
    let level = 0;
    if (totalActivity >= 20) level = 4;
    else if (totalActivity >= 10) level = 3;
    else if (totalActivity >= 5) level = 2;
    else if (totalActivity >= 1) level = 1;

    const estimatedMinutes = sessions * 30 + commits * 5;

    const existing = await ctx.db
      .query("dayActivities")
      .withIndex("by_date", (q) => q.eq("date", date))
      .first();

    const data = { date, level, sessions, commits, issuesClosed, prsMerged, estimatedMinutes };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("dayActivities", data);
    }
  },
});
