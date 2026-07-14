"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useLive } from "@/components/live";

const links = [
  { href: "/", label: "Inbox", adminOnly: false },
  { href: "/feeds", label: "Feeds", adminOnly: false },
  { href: "/categories", label: "Categories", adminOnly: false },
  { href: "/templates", label: "Templates", adminOnly: false },
  { href: "/projects", label: "Article → Video", adminOnly: false },
  { href: "/music", label: "Music", adminOnly: false },
  { href: "/brands", label: "Brands", adminOnly: true },
  { href: "/users", label: "Users", adminOnly: true },
  { href: "/settings", label: "Settings", adminOnly: true },
];

export function Sidebar({ user }: { user: { name: string; role: string } }) {
  const pathname = usePathname();
  const { unreadCount, pushEnabled, pushSupported, enablePush, disablePush } = useLive();

  return (
    <aside className="w-56 shrink-0 h-screen sticky top-0 flex flex-col bg-slate-900 border-r border-slate-800">
      <div className="px-4 py-5 border-b border-slate-800">
        <p className="text-white font-semibold">News Studio</p>
        <p className="text-xs text-slate-500 mt-0.5">RSS → social content</p>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {links
          .filter((l) => !l.adminOnly || user.role === "ADMIN")
          .map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-indigo-600/20 text-indigo-300"
                    : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <span>{l.label}</span>
                {l.href === "/" && unreadCount > 0 && (
                  <span className="rounded-full bg-indigo-600 text-white text-xs px-2 py-0.5">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
      </nav>
      <div className="p-3 border-t border-slate-800 space-y-2">
        {pushSupported && (
          <button
            onClick={() => (pushEnabled ? disablePush() : enablePush())}
            className={`w-full rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              pushEnabled
                ? "bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {pushEnabled ? "🔔 Push on" : "🔕 Enable push"}
          </button>
        )}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-white">{user.name}</p>
            <p className="text-[10px] text-slate-500">{user.role.toLowerCase()}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-xs text-slate-400 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
