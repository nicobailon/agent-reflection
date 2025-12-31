"use client";

import useSWR, { mutate } from "swr";
import { fetcher, patchApi } from "@/lib/api";
import { useState } from "react";

interface BlogDraft {
  id: string;
  weekStart: string;
  weekEnd: string;
  content: string;
  status: "pending_review" | "reviewed" | "published";
  createdAt: number;
  publishedAt?: number;
}

export default function BlogPage() {
  const { data: drafts } = useSWR<BlogDraft[]>("/api/blog-drafts", fetcher);

  const updateStatus = async (weekStart: string, status: string) => {
    await patchApi(`/api/blog-drafts/by-week/${weekStart}`, { status });
    mutate("/api/blog-drafts");
  };

  return (
    <main className="min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {drafts === undefined ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-48 bg-zinc-900 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : drafts.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            <p>No blog drafts yet.</p>
            <p className="text-sm mt-2">
              Run <code className="bg-zinc-800 px-2 py-1 rounded">npm run generate:blog</code> to create one.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {drafts.map((draft: BlogDraft) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                onStatusChange={(status) => updateStatus(draft.weekStart, status)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function DraftCard({
  draft,
  onStatusChange,
}: {
  draft: BlogDraft;
  onStatusChange: (status: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const statusColors: Record<string, string> = {
    pending_review: "bg-yellow-900/50 text-yellow-400",
    reviewed: "bg-blue-900/50 text-blue-400",
    published: "bg-emerald-900/50 text-emerald-400",
  };

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-zinc-200">
              Week of {draft.weekStart}
            </h3>
            <p className="text-sm text-zinc-500">to {draft.weekEnd}</p>
          </div>
          <span
            className={`text-xs px-2 py-1 rounded ${statusColors[draft.status] || "bg-zinc-800"}`}
          >
            {draft.status.replace("_", " ")}
          </span>
        </div>
      </div>

      <div className="p-4">
        <div
          className={`prose prose-invert prose-sm max-w-none ${
            expanded ? "" : "max-h-48 overflow-hidden"
          }`}
        >
          <pre className="whitespace-pre-wrap text-sm text-zinc-300 font-sans">
            {draft.content}
          </pre>
        </div>
        {!expanded && draft.content.length > 500 && (
          <button
            onClick={() => setExpanded(true)}
            className="text-sm text-zinc-500 hover:text-zinc-300 mt-2"
          >
            Show more...
          </button>
        )}
      </div>

      <div className="p-4 border-t border-zinc-800 flex gap-2">
        {draft.status === "pending_review" && (
          <button
            onClick={() => onStatusChange("reviewed")}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Mark Reviewed
          </button>
        )}
        {draft.status === "reviewed" && (
          <button
            onClick={() => onStatusChange("published")}
            className="px-3 py-1 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700"
          >
            Mark Published
          </button>
        )}
        <button
          onClick={() => navigator.clipboard.writeText(draft.content)}
          className="px-3 py-1 bg-zinc-700 text-zinc-200 text-sm rounded hover:bg-zinc-600"
        >
          Copy Markdown
        </button>
      </div>
    </div>
  );
}
