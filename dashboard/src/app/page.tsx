import { ActivityFeed } from "@/components/ActivityFeed";
import { ContributionGraph } from "@/components/ContributionGraph";
import { StatsCards } from "@/components/StatsCards";
import Link from "next/link";

export default function DashboardHome() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Agent Reflection</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/projects" className="text-zinc-400 hover:text-zinc-100">
              Projects
            </Link>
            <Link href="/insights" className="text-zinc-400 hover:text-zinc-100">
              Insights
            </Link>
            <Link href="/bookmarks" className="text-zinc-400 hover:text-zinc-100">
              Bookmarks
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <section>
          <h2 className="text-sm font-medium mb-4 text-zinc-500 uppercase tracking-wider">
            Activity (Past Year)
          </h2>
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
            <ContributionGraph weeks={52} />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium mb-4 text-zinc-500 uppercase tracking-wider">
            This Week
          </h2>
          <StatsCards />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <h2 className="text-sm font-medium mb-4 text-zinc-500 uppercase tracking-wider">
              Recent Activity
            </h2>
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
              <ActivityFeed limit={15} />
            </div>
          </div>

          <div>
            <h2 className="text-sm font-medium mb-4 text-zinc-500 uppercase tracking-wider">
              Quick Links
            </h2>
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4 space-y-2">
              <QuickLink href="/projects" label="All Projects" />
              <QuickLink href="/insights" label="View Insights" />
              <QuickLink href="/bookmarks" label="Bookmarks" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block px-3 py-2 rounded-lg hover:bg-zinc-800 text-zinc-300 text-sm transition-colors"
    >
      {label}
    </Link>
  );
}
