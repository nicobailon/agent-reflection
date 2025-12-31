"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { useMemo } from "react";

interface DayData {
  date: string;
  level: number;
  sessions: number;
  commits: number;
}

interface ContributionGraphProps {
  weeks?: number;
}

export function ContributionGraph({ weeks = 52 }: ContributionGraphProps) {
  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - weeks * 7);
    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    };
  }, [weeks]);

  const { data } = useSWR<DayData[]>(
    `/api/day-activities?startDate=${startDate}&endDate=${endDate}`,
    fetcher
  );

  const grid = useMemo(() => {
    if (!data) return null;

    const dataMap = new Map<string, DayData>(data.map((d: DayData) => [d.date, d]));
    const days: Array<{ date: string; level: number; tooltip: string }> = [];

    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      const dayData = dataMap.get(dateStr);

      days.push({
        date: dateStr,
        level: dayData?.level ?? 0,
        tooltip: dayData
          ? `${dateStr}: ${dayData.sessions}s, ${dayData.commits}c`
          : `${dateStr}: No activity`,
      });

      current.setDate(current.getDate() + 1);
    }

    return days;
  }, [data, startDate, endDate]);

  if (!grid) {
    return (
      <div className="h-32 bg-zinc-900 rounded-lg animate-pulse" />
    );
  }

  const startDayOfWeek = new Date(startDate).getDay();
  const paddedGrid = [
    ...Array(startDayOfWeek).fill({ date: "", level: -1, tooltip: "" }),
    ...grid,
  ];

  const columns = Math.ceil(paddedGrid.length / 7);

  return (
    <div className="overflow-x-auto pb-2">
      <div
        className="grid gap-1"
        style={{
          gridTemplateRows: "repeat(7, 1fr)",
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gridAutoFlow: "column",
        }}
      >
        {paddedGrid.map((day, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-sm ${levelToColor(day.level)}`}
            title={day.tooltip}
          />
        ))}
      </div>
    </div>
  );
}

function levelToColor(level: number): string {
  if (level === -1) return "bg-transparent";
  const colors = [
    "bg-zinc-800",
    "bg-emerald-900",
    "bg-emerald-700",
    "bg-emerald-500",
    "bg-emerald-400",
  ];
  return colors[level] ?? colors[0];
}
