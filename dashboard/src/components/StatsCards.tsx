"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useMemo } from "react";

export function StatsCards() {
  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    };
  }, []);

  const data = useQuery(api.dayActivities.getContributionGraph, {
    startDate,
    endDate,
  });

  const stats = useMemo(() => {
    if (!data) return null;

    const totals = data.reduce(
      (acc: { sessions: number; commits: number; issuesClosed: number; prsMerged: number; minutes: number }, day: { sessions: number; commits: number; issuesClosed: number; prsMerged: number; estimatedMinutes: number }) => ({
        sessions: acc.sessions + day.sessions,
        commits: acc.commits + day.commits,
        issuesClosed: acc.issuesClosed + day.issuesClosed,
        prsMerged: acc.prsMerged + day.prsMerged,
        minutes: acc.minutes + day.estimatedMinutes,
      }),
      { sessions: 0, commits: 0, issuesClosed: 0, prsMerged: 0, minutes: 0 }
    );

    return totals;
  }, [data]);

  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-zinc-900 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const cards = [
    { label: "Sessions", value: stats.sessions, suffix: "" },
    { label: "Commits", value: stats.commits, suffix: "" },
    { label: "Issues Closed", value: stats.issuesClosed, suffix: "" },
    { label: "Time", value: Math.round(stats.minutes / 60), suffix: "h" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4"
        >
          <div className="text-2xl font-bold text-zinc-100">
            {card.value}
            <span className="text-zinc-500 text-lg">{card.suffix}</span>
          </div>
          <div className="text-sm text-zinc-500 mt-1">{card.label}</div>
        </div>
      ))}
    </div>
  );
}
