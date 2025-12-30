"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { formatDistanceToNow } from "date-fns";

interface Activity {
  _id: string;
  type: string;
  timestamp: number;
  project?: string;
  payload?: Record<string, unknown>;
}

interface ActivityFeedProps {
  limit?: number;
  projectFilter?: string;
  publicOnly?: boolean;
}

export function ActivityFeed({ limit = 20, projectFilter, publicOnly }: ActivityFeedProps) {
  const activities = useQuery(api.activities.getActivityFeed, {
    limit,
    projectFilter,
    publicOnly,
  });

  if (activities === undefined) {
    return <ActivityFeedSkeleton count={limit} />;
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        No activities yet. Run the ingestion script to populate data.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {activities.map((activity: Activity) => (
        <ActivityItem key={activity._id} activity={activity} />
      ))}
    </div>
  );
}

function ActivityItem({ activity }: { activity: Activity }) {
  const icon = getActivityIcon(activity.type);
  const description = formatActivityDescription(activity);

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-zinc-900/50 transition-colors">
      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-sm">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 truncate">{description}</p>
        {activity.project && (
          <p className="text-xs text-zinc-500 mt-0.5">{activity.project}</p>
        )}
      </div>
      <time className="text-xs text-zinc-600 whitespace-nowrap">
        {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
      </time>
    </div>
  );
}

function ActivityFeedSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 p-3 animate-pulse">
          <div className="w-8 h-8 rounded-full bg-zinc-800" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-zinc-800 rounded w-3/4" />
            <div className="h-3 bg-zinc-800 rounded w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

function getActivityIcon(type: string): string {
  const icons: Record<string, string> = {
    session_message: "S",
    commit: "C",
    issue_opened: "I",
    issue_closed: "I",
    pr_opened: "P",
    pr_merged: "M",
    doc_created: "D",
    doc_modified: "D",
    bookmark_added: "B",
  };
  return icons[type] ?? "?";
}

function formatActivityDescription(activity: Activity): string {
  const { type, payload, project } = activity;
  switch (type) {
    case "commit":
      return `Commit: ${payload?.message ?? "No message"}`;
    case "session_message":
      return `Session in ${project ?? "unknown project"}`;
    case "issue_opened":
      return `Opened: ${payload?.title ?? "Issue"}`;
    case "issue_closed":
      return `Closed: ${payload?.title ?? "Issue"}`;
    case "pr_opened":
      return `PR opened: ${payload?.title ?? "Pull request"}`;
    case "pr_merged":
      return `PR merged: ${payload?.title ?? "Pull request"}`;
    case "doc_created":
      return `Created: ${payload?.filename ?? "Document"}`;
    case "doc_modified":
      return `Modified: ${payload?.filename ?? "Document"}`;
    case "bookmark_added":
      return `Bookmarked: @${payload?.authorHandle ?? "unknown"}`;
    default:
      return type.replace(/_/g, " ");
  }
}
