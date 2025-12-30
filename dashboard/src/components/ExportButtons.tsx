"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useState } from "react";

interface Activity {
  date: string;
  type: string;
  project?: string;
  source: string;
  isPublic: boolean;
}

export function ExportButtons() {
  const [exporting, setExporting] = useState(false);

  const activities = useQuery(api.activities.getActivityFeed, { limit: 1000 });

  const exportJson = async () => {
    if (!activities) return;
    setExporting(true);

    const publicActivities = activities.filter((a: Activity) => a.isPublic);
    const blob = new Blob([JSON.stringify(publicActivities, null, 2)], {
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

    const publicActivities = activities.filter((a: Activity) => a.isPublic);
    const headers = ["date", "type", "project", "source"];
    const rows = publicActivities.map((a: Activity) =>
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
