import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const getActivityFeed = query({
  args: {
    limit: v.optional(v.number()),
    projectFilter: v.optional(v.string()),
    typeFilter: v.optional(v.array(v.string())),
    publicOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const fetchLimit = limit * 3;

    let activities = await ctx.db
      .query("activities")
      .withIndex("by_date")
      .order("desc")
      .take(fetchLimit);

    if (args.publicOnly) {
      activities = activities.filter((a) => a.isPublic);
    }
    if (args.projectFilter) {
      activities = activities.filter((a) => a.project === args.projectFilter);
    }
    if (args.typeFilter && args.typeFilter.length > 0) {
      activities = activities.filter((a) => args.typeFilter!.includes(a.type));
    }

    return activities.slice(0, limit);
  },
});

export const getByDate = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    return ctx.db
      .query("activities")
      .withIndex("by_date", (q) => q.eq("date", date))
      .collect();
  },
});

export const batchInsert = mutation({
  args: {
    activities: v.array(v.object({
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
    })),
  },
  handler: async (ctx, { activities }) => {
    let inserted = 0;
    const affectedDates = new Set<string>();

    for (const activity of activities) {
      const existing = await ctx.db
        .query("activities")
        .withIndex("by_sourceId", (q) => q.eq("sourceId", activity.sourceId))
        .first();

      if (!existing) {
        await ctx.db.insert("activities", activity as any);
        inserted++;
        affectedDates.add(activity.date);
      }
    }

    for (const date of affectedDates) {
      const dayActivities = await ctx.db
        .query("activities")
        .withIndex("by_date", (q) => q.eq("date", date))
        .collect();

      const sessions = dayActivities.filter((a) => a.source === "cass").length;
      const commits = dayActivities.filter((a) => a.type === "commit").length;
      const issuesClosed = dayActivities.filter((a) => a.type === "issue_closed").length;
      const prsMerged = dayActivities.filter((a) => a.type === "pr_merged").length;

      const totalActivity = sessions + commits + issuesClosed + prsMerged;
      let level = 0;
      if (totalActivity >= 20) level = 4;
      else if (totalActivity >= 10) level = 3;
      else if (totalActivity >= 5) level = 2;
      else if (totalActivity >= 1) level = 1;

      const estimatedMinutes = sessions * 30 + commits * 5;

      const existingDay = await ctx.db
        .query("dayActivities")
        .withIndex("by_date", (q) => q.eq("date", date))
        .first();

      const data = { date, level, sessions, commits, issuesClosed, prsMerged, estimatedMinutes };

      if (existingDay) {
        await ctx.db.patch(existingDay._id, data);
      } else {
        await ctx.db.insert("dayActivities", data);
      }
    }

    return { inserted, skipped: activities.length - inserted };
  },
});

export const deleteBySource = internalMutation({
  args: { source: v.string(), before: v.number() },
  handler: async (ctx, { source, before }) => {
    const toDelete = await ctx.db
      .query("activities")
      .withIndex("by_source", (q) => q.eq("source", source as any))
      .filter((q) => q.lt(q.field("timestamp"), before))
      .collect();

    for (const doc of toDelete) {
      await ctx.db.delete(doc._id);
    }
    return { deleted: toDelete.length };
  },
});
