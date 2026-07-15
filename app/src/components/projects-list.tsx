"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ProjectRow = {
  id: string;
  title: string;
  aspect: string;
  kind?: string;
  status: string;
  outputUrl: string;
  updatedAt: string;
  _count: { scenes: number };
};

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-slate-800 text-slate-300",
  QUEUED: "bg-amber-900/40 text-amber-300",
  RENDERING: "bg-amber-900/40 text-amber-300 animate-pulse",
  DONE: "bg-emerald-900/40 text-emerald-300",
  ERROR: "bg-red-900/40 text-red-300",
};

export function ProjectsList() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);

  useEffect(() => {
    const load = () =>
      fetch("/api/projects")
        .then((r) => r.json())
        .then((all: ProjectRow[]) => setProjects(all.filter((p) => p.kind !== "montage")));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  async function remove(id: string) {
    if (!confirm("Delete this project?")) return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Article → Video projects</h1>
        <p className="text-sm text-slate-500">
          Start a project from any inbox item with the 📹 Article → video button.
        </p>
      </div>

      <ul className="space-y-2">
        {projects.map((p) => (
          <li
            key={p.id}
            className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <Link
                href={`/projects/${p.id}`}
                dir="auto"
                className="text-sm font-medium text-white hover:text-indigo-300 truncate block"
              >
                {p.title || "(untitled)"}
              </Link>
              <p className="text-xs text-slate-500 mt-0.5">
                {p.aspect} · {p._count.scenes} scenes
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[p.status] ?? ""}`}
            >
              {p.status.toLowerCase()}
            </span>
            {p.status === "DONE" && p.outputUrl && (
              <a href={p.outputUrl} download className="text-xs text-emerald-400 hover:underline">
                ⬇ MP4
              </a>
            )}
            <Link
              href={`/projects/${p.id}`}
              className="rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs"
            >
              Open
            </Link>
            <button
              onClick={() => remove(p.id)}
              className="text-xs text-slate-500 hover:text-red-400"
            >
              Delete
            </button>
          </li>
        ))}
        {projects.length === 0 && (
          <li className="text-sm text-slate-500">
            No projects yet — open an inbox item and click 📹 Article → video.
          </li>
        )}
      </ul>
    </div>
  );
}
