"use client";

import { ExportButtons } from "@/components/ExportButtons";

export default function SettingsPage() {
  return (
    <main className="min-h-screen">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        <section>
          <h2 className="text-lg font-medium mb-4 text-zinc-300">Data Sources</h2>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-4">
            <SettingRow
              label="CASS Sessions"
              description="Coding agent session data from ~/.pi/agent/sessions/"
              status="Active"
            />
            <SettingRow
              label="GitHub Activity"
              description="Commits, PRs, and issues from public repos"
              status="Active"
            />
            <SettingRow
              label="Twitter Bookmarks"
              description="Imported from ~/data/agent-reflection/twitter/"
              status="Active"
            />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium mb-4 text-zinc-300">Ingestion Commands</h2>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-3">
            <CommandRow
              label="Run CASS ingestion"
              command="uv run main.py"
            />
            <CommandRow
              label="Run GitHub ingestion"
              command="npm run ingest:github"
            />
            <CommandRow
              label="Run Twitter ingestion"
              command="npm run ingest:twitter-sqlite"
            />
            <CommandRow
              label="Generate blog draft"
              command="npm run generate:blog"
            />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium mb-4 text-zinc-300">Configuration Files</h2>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-2 text-sm">
            <p className="text-zinc-400">
              <code className="bg-zinc-800 px-2 py-0.5 rounded">~/.config/cass/daily-report.toml</code>
              <span className="text-zinc-500 ml-2">Main configuration</span>
            </p>
            <p className="text-zinc-400">
              <code className="bg-zinc-800 px-2 py-0.5 rounded">~/.config/cass/daily-report-prompt.md</code>
              <span className="text-zinc-500 ml-2">LLM prompt template</span>
            </p>
            <p className="text-zinc-400">
              <code className="bg-zinc-800 px-2 py-0.5 rounded">~/data/agent-reflection/reflection.db</code>
              <span className="text-zinc-500 ml-2">SQLite database</span>
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium mb-4 text-zinc-300">Export Data</h2>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
            <ExportButtons />
          </div>
        </section>
      </div>
    </main>
  );
}

function SettingRow({
  label,
  description,
  status,
}: {
  label: string;
  description: string;
  status: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-zinc-200">{label}</div>
        <div className="text-sm text-zinc-500">{description}</div>
      </div>
      <span className="text-xs bg-emerald-900/50 text-emerald-400 px-2 py-1 rounded">
        {status}
      </span>
    </div>
  );
}

function CommandRow({ label, command }: { label: string; command: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-zinc-400 text-sm">{label}</span>
      <code className="text-xs bg-zinc-800 px-2 py-1 rounded text-zinc-300">
        {command}
      </code>
    </div>
  );
}
