"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { useState } from "react";

interface Activity {
  date: string;
  type: string;
  project?: string;
  source: string;
  isPublic: number;
}

export function ExportButtons() {
  const [exporting, setExporting] = useState(false);

  const { data: activities } = useSWR<Activity[]>(
    "/api/activities?limit=1000&publicOnly=true",
    fetcher
  );

  const exportJson = async () => {
    if (!activities) return;
    setExporting(true);

    const blob = new Blob([JSON.stringify(activities, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-reflection-export-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setExporting(false);
  };

  const exportCsv = async () => {
    if (!activities) return;
    setExporting(true);

    const headers = ["date", "type", "project", "source"];
    const rows = activities.map((a: Activity) =>
      [a.date, a.type, a.project || "", a.source].join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-reflection-export-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    setExporting(false);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">
        Export public activity data (private data is excluded)
      </p>
      <div className="flex gap-3">
        <button
          onClick={exportJson}
          disabled={!activities || exporting}
          className="px-4 py-2 bg-zinc-700 text-zinc-200 text-sm rounded-lg hover:bg-zinc-600 disabled:opacity-50"
        >
          Export JSON
        </button>
        <button
          onClick={exportCsv}
          disabled={!activities || exporting}
          className="px-4 py-2 bg-zinc-700 text-zinc-200 text-sm rounded-lg hover:bg-zinc-600 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>
    </div>
  );
}
