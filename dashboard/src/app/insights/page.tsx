"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { TrendChart } from "@/components/TrendChart";
import { useMemo } from "react";

const CATEGORIES = [
  { id: "testing_gaps", name: "Testing Gaps" },
  { id: "unused_artifacts", name: "Unused Artifacts" },
  { id: "debug_pollution", name: "Debug Pollution" },
  { id: "state_management", name: "State Management" },
  { id: "naming_inconsistencies", name: "Naming Issues" },
  { id: "process_skips", name: "Process Skips" },
  { id: "error_handling", name: "Error Handling" },
  { id: "todo_accumulation", name: "TODO Accumulation" },
];

interface AnalysisResult {
  id: string;
  categoryDisplay: string;
  summary: string;
  antiPatterns?: Array<{ description: string }>;
  wins?: Array<{ description: string }>;
}

export default function InsightsPage() {
  const today = useMemo(() => new Date().toISOString().split("T")[0], []);
  const { data: results } = useSWR<AnalysisResult[]>(
    `/api/analysis-results?date=${today}`,
    fetcher
  );

  return (
    <main className="min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <section>
          <h2 className="text-lg font-medium mb-4 text-zinc-300">Today&apos;s Analysis</h2>
          {results === undefined ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 bg-zinc-900 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              No analysis results for today. Run the ingestion script to generate insights.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {results.map((result: AnalysisResult) => (
                <CategoryCard key={result.id} result={result} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-medium mb-4 text-zinc-300">Trends (30 days)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {CATEGORIES.slice(0, 4).map((cat) => (
              <div
                key={cat.id}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4"
              >
                <h3 className="text-sm font-medium text-zinc-400 mb-3">{cat.name}</h3>
                <TrendChart category={cat.id} days={30} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function CategoryCard({ result }: { result: AnalysisResult }) {
  const antiPatternCount = result.antiPatterns?.length ?? 0;
  const winCount = result.wins?.length ?? 0;

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-medium text-zinc-200">{result.categoryDisplay}</h3>
        <div className="flex gap-2">
          {antiPatternCount > 0 && (
            <span className="text-xs bg-red-900/50 text-red-400 px-2 py-0.5 rounded">
              {antiPatternCount} issues
            </span>
          )}
          {winCount > 0 && (
            <span className="text-xs bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded">
              {winCount} wins
            </span>
          )}
        </div>
      </div>
      <p className="text-sm text-zinc-400">{result.summary}</p>
      {(result.antiPatterns?.length ?? 0) > 0 && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 mb-2">Top issue:</p>
          <p className="text-sm text-zinc-300">
            {result.antiPatterns?.[0]?.description}
          </p>
        </div>
      )}
    </div>
  );
}
