"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BrandDto } from "@/lib/types";

type ProjectRow = {
  id: string;
  title: string;
  aspect: string;
  kind: string;
  status: string;
  outputUrl: string;
  _count: { scenes: number };
};
type VideoTemplate = {
  id: string;
  name: string;
  brandId: string | null;
  aspect: string;
  clipCount: number;
  perClipSeconds: number;
  transition: string;
  kenburns: string;
  captionStyleId: string | null;
  musicTrackId: string | null;
};
type CaptionStyle = { id: string; name: string };
type MusicTrack = { id: string; name: string };

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-slate-800 text-slate-300",
  QUEUED: "bg-amber-900/40 text-amber-300",
  RENDERING: "bg-amber-900/40 text-amber-300 animate-pulse",
  DONE: "bg-emerald-900/40 text-emerald-300",
  ERROR: "bg-red-900/40 text-red-300",
};
const ASPECTS = ["9:16", "1:1", "4:5", "16:9"];

export function ShortVideos() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [templates, setTemplates] = useState<VideoTemplate[]>([]);
  const [brands, setBrands] = useState<BrandDto[]>([]);
  const [captionStyles, setCaptionStyles] = useState<CaptionStyle[]>([]);
  const [music, setMusic] = useState<MusicTrack[]>([]);
  const [busy, setBusy] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  // ad-hoc quick create
  const [aspect, setAspect] = useState("9:16");
  const [clipCount, setClipCount] = useState(1);

  const loadProjects = () =>
    fetch("/api/projects").then((r) => r.json()).then((all: ProjectRow[]) =>
      setProjects(all.filter((p) => p.kind === "montage")),
    );

  useEffect(() => {
    loadProjects();
    fetch("/api/video-templates").then((r) => r.json()).then(setTemplates);
    fetch("/api/brands").then((r) => r.json()).then(setBrands);
    fetch("/api/captions").then((r) => r.json()).then((s) => setCaptionStyles(Array.isArray(s) ? s : []));
    fetch("/api/music").then((r) => r.json()).then((m) => setMusic(Array.isArray(m) ? m : []));
    const t = setInterval(loadProjects, 5000);
    return () => clearInterval(t);
  }, []);

  async function create(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/projects/montage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const p = await res.json();
        router.push(`/projects/${p.id}`);
      } else alert((await res.json().catch(() => ({}))).error || "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this short video?")) return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Short videos</h1>
        <p className="text-sm text-slate-500">
          1–3 animated photos/videos, up to 15 seconds — with motion, transitions, captions and music.
        </p>
      </div>

      {/* quick create */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3">
        <p className="text-xs uppercase tracking-wide text-slate-500">New short video</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-400">
            Format
            <select value={aspect} onChange={(e) => setAspect(e.target.value)} className="mt-1 block rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs">
              {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Clips
            <select value={clipCount} onChange={(e) => setClipCount(Number(e.target.value))} className="mt-1 block rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs">
              <option value={1}>1 clip</option>
              <option value={2}>2 clips</option>
              <option value={3}>3 clips</option>
            </select>
          </label>
          <button
            onClick={() => create({ aspect, clipCount })}
            disabled={busy}
            className="rounded-lg bg-fuchsia-700 hover:bg-fuchsia-600 disabled:opacity-50 px-4 py-1.5 text-sm font-medium"
          >
            + Create blank
          </button>
        </div>
        {templates.length > 0 && (
          <div className="pt-2 border-t border-slate-800">
            <p className="text-[11px] text-slate-500 mb-1.5">…or start from a template</p>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => create({ templateId: t.id })}
                  disabled={busy}
                  className="rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 px-3 py-1.5 text-xs"
                  title={`${t.clipCount} clip(s) · ${t.aspect} · ${t.perClipSeconds}s each`}
                >
                  🎬 {t.name}
                  <span className="text-slate-500 ml-1">{t.aspect} · {t.clipCount}c</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* template manager */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
        <button onClick={() => setShowTemplates((s) => !s)} className="text-xs text-slate-300 hover:text-white">
          {showTemplates ? "▾" : "▸"} Manage templates ({templates.length})
        </button>
        {showTemplates && (
          <TemplateManager
            templates={templates}
            brands={brands}
            captionStyles={captionStyles}
            music={music}
            onChange={setTemplates}
          />
        )}
      </div>

      {/* existing short videos */}
      <ul className="space-y-2">
        {projects.map((p) => (
          <li key={p.id} className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <Link href={`/projects/${p.id}`} dir="auto" className="text-sm font-medium text-white hover:text-indigo-300 truncate block">
                {p.title || "(untitled)"}
              </Link>
              <p className="text-xs text-slate-500 mt-0.5">{p.aspect} · {p._count.scenes} clip(s)</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[p.status] ?? ""}`}>{p.status.toLowerCase()}</span>
            {p.status === "DONE" && p.outputUrl && (
              <a href={p.outputUrl} download className="text-xs text-emerald-400 hover:underline">⬇ MP4</a>
            )}
            <Link href={`/projects/${p.id}`} className="rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs">Open</Link>
            <button onClick={() => remove(p.id)} className="text-xs text-slate-500 hover:text-red-400">Delete</button>
          </li>
        ))}
        {projects.length === 0 && <li className="text-sm text-slate-500">No short videos yet — create one above.</li>}
      </ul>
    </div>
  );
}

function TemplateManager({
  templates,
  brands,
  captionStyles,
  music,
  onChange,
}: {
  templates: VideoTemplate[];
  brands: BrandDto[];
  captionStyles: CaptionStyle[];
  music: MusicTrack[];
  onChange: (t: VideoTemplate[]) => void;
}) {
  const [name, setName] = useState("");
  const [draft, setDraft] = useState({
    brandId: "",
    aspect: "9:16",
    clipCount: 1,
    perClipSeconds: 4,
    transition: "fade",
    kenburns: "in",
    captionStyleId: "",
    musicTrackId: "",
  });

  async function add() {
    if (!name.trim()) return;
    const res = await fetch("/api/video-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        brandId: draft.brandId || null,
        aspect: draft.aspect,
        clipCount: draft.clipCount,
        perClipSeconds: draft.perClipSeconds,
        transition: draft.transition,
        kenburns: draft.kenburns,
        captionStyleId: draft.captionStyleId || null,
        musicTrackId: draft.musicTrackId || null,
      }),
    });
    if (res.ok) {
      onChange([await res.json(), ...templates]);
      setName("");
    } else alert((await res.json().catch(() => ({}))).error || "Failed");
  }
  async function del(id: string) {
    const res = await fetch(`/api/video-templates/${id}`, { method: "DELETE" });
    if (res.ok) onChange(templates.filter((t) => t.id !== id));
  }

  const sel = "rounded bg-slate-800 border border-slate-700 px-2 py-1 text-xs";
  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
        <label className="text-[11px] text-slate-400 col-span-2">
          Template name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Breaking 3-clip" className={`mt-1 w-full ${sel}`} />
        </label>
        <label className="text-[11px] text-slate-400">
          Brand
          <select value={draft.brandId} onChange={(e) => setDraft({ ...draft, brandId: e.target.value })} className={`mt-1 w-full ${sel}`}>
            <option value="">Generic</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-slate-400">
          Format
          <select value={draft.aspect} onChange={(e) => setDraft({ ...draft, aspect: e.target.value })} className={`mt-1 w-full ${sel}`}>
            {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-slate-400">
          Clips
          <select value={draft.clipCount} onChange={(e) => setDraft({ ...draft, clipCount: Number(e.target.value) })} className={`mt-1 w-full ${sel}`}>
            <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
          </select>
        </label>
        <label className="text-[11px] text-slate-400">
          Seconds / clip
          <input type="number" min={1} max={15} step={0.5} value={draft.perClipSeconds} onChange={(e) => setDraft({ ...draft, perClipSeconds: Number(e.target.value) })} className={`mt-1 w-full ${sel}`} />
        </label>
        <label className="text-[11px] text-slate-400">
          Motion
          <select value={draft.kenburns} onChange={(e) => setDraft({ ...draft, kenburns: e.target.value })} className={`mt-1 w-full ${sel}`}>
            {["in", "out", "left", "right", "none"].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-slate-400">
          Transition
          <select value={draft.transition} onChange={(e) => setDraft({ ...draft, transition: e.target.value })} className={`mt-1 w-full ${sel}`}>
            <option value="fade">fade</option><option value="cut">cut</option>
          </select>
        </label>
        <label className="text-[11px] text-slate-400">
          Caption style
          <select value={draft.captionStyleId} onChange={(e) => setDraft({ ...draft, captionStyleId: e.target.value })} className={`mt-1 w-full ${sel}`}>
            <option value="">Default</option>
            {captionStyles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-slate-400">
          Music
          <select value={draft.musicTrackId} onChange={(e) => setDraft({ ...draft, musicTrackId: e.target.value })} className={`mt-1 w-full ${sel}`}>
            <option value="">None</option>
            {music.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <button onClick={add} className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-medium h-fit">Save template</button>
      </div>
      <ul className="space-y-1">
        {templates.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-xs text-slate-400 border-t border-slate-800 pt-1">
            <span className="text-slate-200">{t.name}</span>
            <span>· {t.aspect} · {t.clipCount} clip(s) · {t.perClipSeconds}s · {t.kenburns}/{t.transition}</span>
            <span>{t.brandId ? "· brand" : "· generic"}</span>
            <button onClick={() => del(t.id)} className="ml-auto text-slate-500 hover:text-red-400">Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
