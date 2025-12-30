import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, { includeArchived }) => {
    const projects = await ctx.db.query("projects").collect();

    if (!includeArchived) {
      return projects.filter((p) => !p.isArchived);
    }
    return projects;
  },
});

export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    return ctx.db
      .query("projects")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
  },
});

export const upsert = mutation({
  args: {
    name: v.string(),
    workspaces: v.optional(v.array(v.string())),
    repoFullName: v.optional(v.string()),
    description: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
    isArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        workspaces: args.workspaces ?? existing.workspaces,
        isPublic: args.isPublic ?? existing.isPublic,
        isArchived: args.isArchived ?? existing.isArchived,
      });
      return existing._id;
    }

    return ctx.db.insert("projects", {
      name: args.name,
      workspaces: args.workspaces ?? [],
      repoFullName: args.repoFullName,
      description: args.description,
      isPublic: args.isPublic ?? false,
      isArchived: args.isArchived ?? false,
      totalSessions: 0,
      totalCommits: 0,
      totalTimeMinutes: 0,
      firstActivity: Date.now(),
      lastActivity: Date.now(),
      antiPatternCounts: {},
    });
  },
});

export const updateStats = mutation({
  args: {
    name: v.string(),
    sessions: v.number(),
    commits: v.number(),
    minutes: v.number(),
  },
  handler: async (ctx, { name, sessions, commits, minutes }) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();

    if (project) {
      await ctx.db.patch(project._id, {
        totalSessions: project.totalSessions + sessions,
        totalCommits: project.totalCommits + commits,
        totalTimeMinutes: project.totalTimeMinutes + minutes,
        lastActivity: Date.now(),
      });
    }
  },
});
