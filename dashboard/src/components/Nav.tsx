"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/insights", label: "Insights" },
  { href: "/bookmarks", label: "Bookmarks" },
  { href: "/blog", label: "Blog" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1">
      {navItems.map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              isActive
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
