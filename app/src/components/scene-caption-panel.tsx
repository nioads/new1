"use client";

import { useEffect, useRef, useState } from "react";
import type { CaptionGroup, SceneStatus } from "@/components/project-editor";

type Scene = {
  id: string;
  text: string;
  captionGroups?: CaptionGroup[] | null;
  status: SceneStatus;
  previewUrl: string;
  previewError: string;
};

const STATUS_LABEL: Record<SceneStatus, string> = {
  DRAFT: "Draft",
  QUEUED: "Queued…",
  PROCESSING: "Rendering…",
  PREVIEW_READY: "Preview ready",
  REQUIRES_CHANGES: "Needs review",
  APPROVED: "Approved",
  RENDER_FAILED: "Preview failed",
};
const STATUS_COLOR: Record<SceneStatus, string> = {
  DRAFT: "bg-slate-700 text-slate-200",
  QUEUED: "bg-amber-800 text-amber-100",
  PROCESSING: "bg-amber-700 text-amber-50",
  PREVIEW_READY: "bg-sky-800 text-sky-100",
  REQUIRES_CHANGES: "bg-orange-800 text-orange-100",
  APPROVED: "bg-emerald-800 text-emerald-100",
  RENDER_FAILED: "bg-red-800 text-red-100",
};

// ── pure editing ops on CaptionGroup[] ───────────────────────────────────────
function reflow(g: CaptionGroup): CaptionGroup {
  const words = g.words;
  return {
    ...g,
    text: words.map((w) => w.text).join(" "),
    startMs: words.length ? words[0].startMs : g.startMs,
    endMs: words.length ? Math.max(words[words.length - 1].endMs, words[0].startMs + 150) : g.endMs,
    direction: /[؀-ۿ]/.test(words.map((w) => w.text).join("")) ? "rtl" : g.direction,
  };
}
function splitAt(groups: CaptionGroup[], gi: number, afterWord: number): CaptionGroup[] {
  const g = groups[gi];
  if (afterWord < 0 || afterWord >= g.words.length - 1) return groups;
  const a = reflow({ ...g, words: g.words.slice(0, afterWord + 1) });
  const b = reflow({ ...g, groupId: `${g.groupId}-b${Date.now() % 100000}`, words: g.words.slice(afterWord + 1) });
  return [...groups.slice(0, gi), a, b, ...groups.slice(gi + 1)];
}
function mergeNext(groups: CaptionGroup[], gi: number): CaptionGroup[] {
  if (gi >= groups.length - 1) return groups;
  const merged = reflow({ ...groups[gi], words: [...groups[gi].words, ...groups[gi + 1].words] });
  return [...groups.slice(0, gi), merged, ...groups.slice(gi + 2)];
}
function moveWord(groups: CaptionGroup[], gi: number, dir: "prev" | "next"): CaptionGroup[] {
  const g = groups[gi];
  if (dir === "prev") {
    if (gi === 0 || g.words.length === 0) return groups;
    const w = g.words[0];
    const prev = reflow({ ...groups[gi - 1], words: [...groups[gi - 1].words, w] });
    const cur = reflow({ ...g, words: g.words.slice(1) });
    const out = [...groups];
    out[gi - 1] = prev;
    out[gi] = cur;
    return out.filter((x) => x.words.length > 0);
  } else {
    if (gi >= groups.length - 1 || g.words.length === 0) return groups;
    const w = g.words[g.words.length - 1];
    const cur = reflow({ ...g, words: g.words.slice(0, -1) });
    const next = reflow({ ...groups[gi + 1], words: [w, ...groups[gi + 1].words] });
    const out = [...groups];
    out[gi] = cur;
    out[gi + 1] = next;
    return out.filter((x) => x.words.length > 0);
  }
}

export function SceneCaptionPanel({
  scene,
  captionsEnabled,
  onRefresh,
}: {
  scene: Scene;
  captionsEnabled: boolean;
  onRefresh: () => void;
}) {
  const [groups, setGroups] = useState<CaptionGroup[]>(scene.captionGroups ?? []);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // keep local groups in sync when the scene reloads (and we have no pending edits)
  useEffect(() => {
    if (!dirty) setGroups(scene.captionGroups ?? []);
  }, [scene.captionGroups, dirty]);

  const pending = scene.status === "QUEUED" || scene.status === "PROCESSING";
  // poll while a preview render is in flight
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(onRefresh, 2500);
    return () => clearInterval(t);
  }, [pending, onRefresh]);

  function edit(fn: (g: CaptionGroup[]) => CaptionGroup[]) {
    setGroups((g) => fn(g));
    setDirty(true);
  }

  async function call(url: string, body?: unknown, method = "POST") {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  }

  async function saveGroups() {
    setBusy("save");
    try {
      await call(`/api/scenes/${scene.id}`, { captionGroups: groups }, "PATCH");
      setDirty(false);
      onRefresh();
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy("");
    }
  }
  async function regenerate(mode: "heuristic" | "ai", applyToAll = false) {
    setBusy("regen");
    try {
      await call(`/api/scenes/${scene.id}/captions`, { mode, applyToAll });
      setDirty(false);
      onRefresh();
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy("");
    }
  }
  async function renderPreview() {
    setBusy("preview");
    try {
      if (dirty) await call(`/api/scenes/${scene.id}`, { captionGroups: groups }, "PATCH");
      await call(`/api/scenes/${scene.id}/preview`);
      setDirty(false);
      onRefresh();
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy("");
    }
  }
  async function setStatus(status: "APPROVED" | "REQUIRES_CHANGES") {
    setBusy("status");
    try {
      await call(`/api/scenes/${scene.id}`, { status }, "PATCH");
      onRefresh();
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy("");
    }
  }

  // preview transport: replay the group containing the current time / step frames
  function replayGroup() {
    const v = videoRef.current;
    if (!v) return;
    const nowMs = v.currentTime * 1000;
    const g = groups.find((x) => nowMs >= x.startMs && nowMs < x.endMs) ?? groups[0];
    if (g) {
      v.currentTime = g.startMs / 1000;
      v.play();
    }
  }
  function stepFrame(dir: 1 | -1) {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.max(0, v.currentTime + (dir * 1) / 25);
  }

  if (!captionsEnabled) {
    return <p className="text-[11px] text-slate-500">Captions are disabled for this project.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOR[scene.status]}`}>
          {STATUS_LABEL[scene.status]}
        </span>
        <button
          onClick={renderPreview}
          disabled={!!busy || pending}
          className="rounded-lg bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 px-2.5 py-1 text-[11px]"
        >
          {pending ? "Rendering…" : scene.previewUrl ? "↻ Re-render preview" : "▶ Render preview"}
        </button>
        {scene.previewUrl && scene.status === "PREVIEW_READY" && (
          <>
            <button
              onClick={() => setStatus("APPROVED")}
              disabled={!!busy}
              className="rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 px-2.5 py-1 text-[11px]"
            >
              ✓ Approve
            </button>
            <button
              onClick={() => setStatus("REQUIRES_CHANGES")}
              disabled={!!busy}
              className="rounded-lg bg-orange-800 hover:bg-orange-700 disabled:opacity-50 px-2.5 py-1 text-[11px]"
            >
              ✗ Needs changes
            </button>
          </>
        )}
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-[11px] ml-auto"
        >
          {open ? "Hide caption editor" : `Edit captions (${groups.length} groups)`}
        </button>
      </div>

      {scene.status === "RENDER_FAILED" && scene.previewError && (
        <p className="text-[11px] text-red-400">Preview failed: {scene.previewError}</p>
      )}

      {scene.previewUrl && (
        <div className="space-y-1.5">
          <video ref={videoRef} src={scene.previewUrl} controls className="w-full max-h-72 rounded-lg bg-black" />
          <div className="flex items-center gap-1.5 text-[11px]">
            <button onClick={() => stepFrame(-1)} className="rounded bg-slate-800 hover:bg-slate-700 px-2 py-0.5" title="Previous frame">⏴ frame</button>
            <button onClick={() => stepFrame(1)} className="rounded bg-slate-800 hover:bg-slate-700 px-2 py-0.5" title="Next frame">frame ⏵</button>
            <button onClick={replayGroup} className="rounded bg-slate-800 hover:bg-slate-700 px-2 py-0.5" title="Replay current caption group">↺ replay group</button>
          </div>
        </div>
      )}

      {open && (
        <div className="space-y-2 rounded-lg bg-slate-950/60 border border-slate-800 p-2">
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
            <button onClick={() => regenerate("heuristic")} disabled={!!busy} className="rounded bg-slate-800 hover:bg-slate-700 px-2 py-0.5 disabled:opacity-50">Regroup (auto)</button>
            <button onClick={() => regenerate("ai")} disabled={!!busy} className="rounded bg-slate-800 hover:bg-slate-700 px-2 py-0.5 disabled:opacity-50" title="Semantic grouping via AI">Regroup (AI)</button>
            <button onClick={() => regenerate("heuristic", true)} disabled={!!busy} className="rounded bg-slate-800 hover:bg-slate-700 px-2 py-0.5 disabled:opacity-50">Apply auto to all scenes</button>
            {dirty && (
              <button onClick={saveGroups} disabled={!!busy} className="rounded bg-emerald-700 hover:bg-emerald-600 px-2 py-0.5 ml-auto disabled:opacity-50">Save caption edits</button>
            )}
          </div>

          {groups.length === 0 && (
            <p className="text-[11px] text-slate-500">No caption groups yet — generate the voice-over or click Regroup.</p>
          )}

          {groups.map((g, gi) => (
            <div key={g.groupId} className="rounded-md bg-slate-900 border border-slate-800 p-2 space-y-1.5" dir={g.direction}>
              <div className="flex items-center gap-1.5" dir="ltr">
                <span className="text-[10px] text-slate-500">Group {gi + 1}</span>
                <span className="text-[10px] text-slate-500">{(g.startMs / 1000).toFixed(2)}s–{(g.endMs / 1000).toFixed(2)}s</span>
                <button
                  onClick={() => edit((gs) => gs.map((x, i) => (i === gi ? { ...x, locked: !x.locked } : x)))}
                  className={`rounded px-1.5 py-0.5 text-[10px] ${g.locked ? "bg-amber-700 text-amber-50" : "bg-slate-800 text-slate-300"}`}
                  title="Lock this phrase against regrouping"
                >
                  {g.locked ? "🔒 locked" : "🔓 lock"}
                </button>
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={() => edit((gs) => moveWord(gs, gi, "prev"))} disabled={gi === 0} className="rounded bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 text-[10px] disabled:opacity-40" title="Move first word to previous group">⇤ word</button>
                  <button onClick={() => edit((gs) => moveWord(gs, gi, "next"))} disabled={gi >= groups.length - 1} className="rounded bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 text-[10px] disabled:opacity-40" title="Move last word to next group">word ⇥</button>
                  <button onClick={() => edit((gs) => mergeNext(gs, gi))} disabled={gi >= groups.length - 1} className="rounded bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 text-[10px] disabled:opacity-40" title="Merge with next group">merge ↓</button>
                </div>
              </div>

              {/* word chips: click between words shows a split button */}
              <div className="flex flex-wrap gap-1 items-center">
                {g.words.map((w, wi) => (
                  <span key={w.id} className="inline-flex items-center gap-1">
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs" title={`${(w.startMs / 1000).toFixed(2)}–${(w.endMs / 1000).toFixed(2)}s`}>{w.text}</span>
                    {wi < g.words.length - 1 && (
                      <button
                        onClick={() => edit((gs) => splitAt(gs, gi, wi))}
                        className="text-[10px] text-slate-500 hover:text-indigo-400"
                        title="Split into a new group here"
                      >
                        ✂
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
