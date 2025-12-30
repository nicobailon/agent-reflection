"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { ActivityFeed } from "@/components/ActivityFeed";
import Link from "next/link";

interface Props {
  params: { name: string };
}

export default function ProjectDetailPage({ params }: Props) {
  const { name } = params;
  const project = useQuery(api.projects.getByName, { name });

  if (project === undefined) {
    return (
      <main className="min-h-screen">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="h-64 bg-zinc-900 rounded-lg animate-pulse" />
        </div>
      </main>
    );
  }

  if (project === null) {
    return (
      <main className="min-h-screen">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="text-center py-12 text-zinc-500">
            Project not found: {name}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/projects" className="hover:text-zinc-300">Projects</Link>
          <span>/</span>
          <span className="text-zinc-200">{project.name}</span>
        </div>
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Sessions" value={project.totalSessions} />
          <StatCard label="Commits" value={project.totalCommits} />
          <StatCard
            label="Time"
            value={`${Math.round(project.totalTimeMinutes / 60)}h`}
          />
          <StatCard
            label="Active Since"
            value={new Date(project.firstActivity).toLocaleDateString()}
          />
        </section>

        {project.description && (
          <section>
            <p className="text-zinc-400">{project.description}</p>
          </section>
        )}

        <section>
          <h2 className="text-lg font-medium mb-4 text-zinc-300">Recent Activity</h2>
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
            <ActivityFeed limit={20} projectFilter={project.name} />
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
      <div className="text-2xl font-bold text-zinc-100">{value}</div>
      <div className="text-sm text-zinc-500 mt-1">{label}</div>
    </div>
  );
}
