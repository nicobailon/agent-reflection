"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface TrendChartProps {
  category: string;
  days?: number;
}

export function TrendChart({ category, days = 30 }: TrendChartProps) {
  const data = useQuery(api.analysisResults.getTrend, { category, days });

  if (!data) {
    return <div className="h-48 bg-zinc-900 rounded-lg animate-pulse" />;
  }

  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-zinc-500">
        No trend data available
      </div>
    );
  }

  const chartData = data.map((d: { date: string; count: number; sevenDayAvg: number }) => ({
    date: d.date.slice(5),
    count: d.count,
    avg: d.sevenDayAvg,
  })).reverse();

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <XAxis
            dataKey="date"
            stroke="#52525b"
            fontSize={12}
            tickLine={false}
          />
          <YAxis
            stroke="#52525b"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: "8px",
            }}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="avg"
            stroke="#6366f1"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
