"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import Link from "next/link";

interface Project {
  _id: string;
  name: string;
  description?: string;
  totalSessions: number;
  totalCommits: number;
  isPublic: boolean;
  repoFullName?: string;
}

export default function ProjectsPage() {
  const projects = useQuery(api.projects.list, { includeArchived: false });

  return (
    <main className="min-h-screen">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-zinc-500 hover:text-zinc-300">
            Home
          </Link>
          <span className="text-zinc-700">/</span>
          <h1 className="text-xl font-semibold">Projects</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {projects === undefined ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-zinc-900 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            No projects yet. Projects are created automatically from activity data.
          </div>
        ) : (
          <div className="space-y-4">
            {projects.map((project: Project) => (
              <Link
                key={project._id}
                href={`/projects/${encodeURIComponent(project.name)}`}
                className="block bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-zinc-100">{project.name}</h3>
                    {project.description && (
                      <p className="text-sm text-zinc-500 mt-1">{project.description}</p>
                    )}
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-zinc-400">{project.totalSessions} sessions</div>
                    <div className="text-zinc-500">{project.totalCommits} commits</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  {project.isPublic && (
                    <span className="text-xs bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded">
                      Public
                    </span>
                  )}
                  {project.repoFullName && (
                    <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                      {project.repoFullName}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
