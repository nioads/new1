"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { BrandDto, NewsItemDto } from "@/lib/types";
import type { MusicTrackDto } from "@/components/music";

const VIDEO_URL = /\.(mp4|m4v|mov|webm|m3u8)(\?|#|$)/i;

// Output languages for the generated narration. "" = match the article.
// Kept in sync with SCRIPT_LANGUAGES in src/lib/ai.ts (server-only module,
// so the list is mirrored here to keep it out of the client bundle).
const SCRIPT_LANGS: Array<{ code: string; label: string }> = [
  { code: "", label: "Auto (match article)" },
  { code: "ar", label: "Arabic — العربية" },
  { code: "en", label: "English" },
  { code: "fr", label: "French — Français" },
  { code: "es", label: "Spanish — Español" },
  { code: "tr", label: "Turkish — Türkçe" },
  { code: "de", label: "German — Deutsch" },
];

type SceneDto = {
  id: string;
  order: number;
  text: string;
  imageUrl: string;
  imageQuery: string;
  imagePrompt: string;
  ttsUrl: string;
  ttsDuration: number;
  voiceId: string;
  kenburns: string;
  transition: string;
  durationSec: number;
  fit: string;
  focusX: number;
  focusY: number;
  zoom: number;
};

type VoiceDto = { id: string; name: string; previewUrl: string; labels: string };

type ProjectDto = {
  id: string;
  title: string;
  aspect: "16:9" | "9:16";
  width: number;
  height: number;
  status: "DRAFT" | "QUEUED" | "RENDERING" | "DONE" | "ERROR";
  scriptPrompt: string;
  script: string;
  musicTrackId: string | null;
  voiceId: string;
  captionsEnabled: boolean;
  captionStyleId: string | null;
  captionRenderer: string;
  captionSrtUrl?: string;
  captionVttUrl?: string;
  brandId: string | null;
  targetSeconds: number;
  scriptModel: string;
  scriptLang: string;
  visualMode: string;
  smHighlight: string;
  smCaption: string;
  smDescription: string;
  smTags: string;
  outputUrl: string;
  error: string;
  scenes: SceneDto[];
  item?: NewsItemDto | null;
};

type SearchResult = { url: string; thumb: string; title: string; source: string };

function proxied(src: string): string {
  if (src.startsWith("/") || src.startsWith("data:")) return src;
  return `/api/media/proxy?url=${encodeURIComponent(src)}`;
}

export function ProjectEditor({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectDto | null>(null);
  const [music, setMusic] = useState<MusicTrackDto[]>([]);
  const [brands, setBrands] = useState<BrandDto[]>([]);
  const [voices, setVoices] = useState<VoiceDto[]>([]);
  const [captionStyles, setCaptionStyles] = useState<Array<{ id: string; name: string }>>([]);
  const [sceneCount, setSceneCount] = useState(6);
  const [generating, setGenerating] = useState(false);
  const [metaBusy, setMetaBusy] = useState(false);
  const [error, setError] = useState("");
  const [pickerScene, setPickerScene] = useState<string | null>(null);
  const [busyScene, setBusyScene] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(() => {
    fetch(`/api/projects/${projectId}`).then((r) => r.json()).then(setProject);
  }, [projectId]);

  useEffect(load, [load]);
  useEffect(() => {
    fetch("/api/music").then((r) => r.json()).then(setMusic);
    fetch("/api/brands").then((r) => r.json()).then(setBrands);
    fetch("/api/voices")
      .then((r) => r.json())
      .then((v) => setVoices(Array.isArray(v) ? v : []));
    fetch("/api/captions").then((r) => r.json()).then(setCaptionStyles);
  }, []);

  // poll while rendering
  useEffect(() => {
    if (project?.status !== "QUEUED" && project?.status !== "RENDERING") return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [project?.status, load]);

  const patchLocalScene = useCallback((sceneId: string, patch: Partial<SceneDto>) => {
    setProject((prev) =>
      prev
        ? {
            ...prev,
            scenes: prev.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)),
          }
        : prev,
    );
  }, []);

  async function save(extra: Record<string, unknown> = {}) {
    if (!project) return;
    setError("");
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        script: project.script,
        scriptPrompt: project.scriptPrompt,
        musicTrackId: project.musicTrackId,
        voiceId: project.voiceId,
        brandId: project.brandId,
        targetSeconds: project.targetSeconds,
        scriptModel: project.scriptModel,
        scriptLang: project.scriptLang,
        visualMode: project.visualMode,
        captionsEnabled: project.captionsEnabled,
        captionStyleId: project.captionStyleId,
        captionRenderer: project.captionRenderer,
        scenes: project.scenes.map((s) => ({
          id: s.id,
          text: s.text,
          imageUrl: s.imageUrl,
          imageQuery: s.imageQuery,
          imagePrompt: s.imagePrompt,
          kenburns: s.kenburns,
          transition: s.transition,
          voiceId: s.voiceId,
          durationSec: s.durationSec,
          fit: s.fit,
          focusX: s.focusX,
          focusY: s.focusY,
          zoom: s.zoom,
        })),
        ...extra,
      }),
    });
    if (res.ok) {
      setSavedAt(Date.now());
      const updated = await res.json();
      setProject((prev) => (prev ? { ...prev, ...updated, item: prev.item } : prev));
    } else setError((await res.json()).error ?? "Save failed");
  }

  async function generateScript() {
    if (!project) return;
    setGenerating(true);
    setError("");
    const res = await fetch(`/api/projects/${project.id}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: project.scriptPrompt, sceneCount, language: project.scriptLang }),
    });
    setGenerating(false);
    if (res.ok) {
      const updated = await res.json();
      setProject((prev) => (prev ? { ...prev, ...updated, item: prev.item } : prev));
    } else setError((await res.json()).error ?? "Script generation failed");
  }

  async function generateTts(sceneId: string) {
    setBusyScene(sceneId);
    setError("");
    // persist latest text first
    await save();
    const res = await fetch(`/api/scenes/${sceneId}/tts`, { method: "POST" });
    setBusyScene(null);
    if (res.ok) {
      const updated = await res.json();
      patchLocalScene(sceneId, updated);
    } else setError((await res.json()).error ?? "TTS failed");
  }

  async function renderProject() {
    await save({ queueRender: true });
  }

  async function generateMeta() {
    if (!project) return;
    setMetaBusy(true);
    setError("");
    const res = await fetch("/api/ai/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    });
    setMetaBusy(false);
    if (res.ok) {
      const m = await res.json();
      setProject((prev) =>
        prev
          ? {
              ...prev,
              smHighlight: m.highlight,
              smCaption: m.caption,
              smDescription: m.description,
              smTags: (m.tags || []).join(", "),
            }
          : prev,
      );
    } else setError((await res.json()).error ?? "Metadata generation failed");
  }

  async function addScene(afterOrder: number) {
    await save();
    const res = await fetch(`/api/projects/${projectId}/scenes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ afterOrder }),
    });
    if (res.ok) load();
  }

  async function deleteScene(sceneId: string) {
    if (!confirm("Remove this scene?")) return;
    const res = await fetch(`/api/scenes/${sceneId}`, { method: "DELETE" });
    if (res.ok) load();
  }

  async function moveScene(sceneId: string, dir: "up" | "down") {
    await save();
    const res = await fetch(`/api/scenes/${sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ move: dir }),
    });
    if (res.ok) load();
  }

  if (!project) return <div className="p-10 text-slate-500 text-sm">Loading project…</div>;

  const rendering = project.status === "QUEUED" || project.status === "RENDERING";

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/projects" className="text-slate-400 hover:text-white text-sm">
          ← Projects
        </Link>
        <p className="text-sm font-medium text-white truncate flex-1" dir="auto">
          {project.title}
        </p>
        <span className="text-xs text-slate-500">{project.aspect}</span>
        <select
          value={project.brandId ?? ""}
          onChange={(e) => setProject({ ...project, brandId: e.target.value || null })}
          className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs max-w-40"
          title="Brand — its intro/outro and logo are applied to the render"
        >
          <option value="">No brand</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          value={project.voiceId}
          onChange={(e) => setProject({ ...project, voiceId: e.target.value })}
          className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs max-w-40"
          title="Default narration voice (scenes can override)"
        >
          <option value="">Default voice</option>
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              🎙 {v.name}
            </option>
          ))}
        </select>
        <select
          value={project.musicTrackId ?? ""}
          onChange={(e) =>
            setProject({ ...project, musicTrackId: e.target.value || null })
          }
          className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs max-w-44"
        >
          <option value="">No music</option>
          {music.map((t) => (
            <option key={t.id} value={t.id}>
              ♫ {t.name}
            </option>
          ))}
        </select>
        <label
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs text-slate-300 cursor-pointer"
          title="Burn captions into the video"
        >
          <input
            type="checkbox"
            checked={project.captionsEnabled}
            onChange={(e) => setProject({ ...project, captionsEnabled: e.target.checked })}
            className="accent-indigo-600"
          />
          Captions
        </label>
        {project.captionsEnabled && (
          <>
            <select
              value={project.captionStyleId ?? ""}
              onChange={(e) => setProject({ ...project, captionStyleId: e.target.value || null })}
              className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs"
              title="Caption style (manage in Settings)"
            >
              <option value="">Hormozi (default)</option>
              {captionStyles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={project.captionRenderer || ""}
              onChange={(e) => setProject({ ...project, captionRenderer: e.target.value })}
              className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs"
              title="Caption renderer — Remotion is animated & premium; libass is faster"
            >
              <option value="">Renderer: default</option>
              <option value="remotion">Remotion (animated)</option>
              <option value="libass">libass (fast)</option>
            </select>
          </>
        )}
        <button
          onClick={() => save()}
          className="rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-sm"
        >
          Save
        </button>
        <button
          onClick={renderProject}
          disabled={rendering || project.scenes.length === 0}
          className="rounded-lg bg-fuchsia-700 hover:bg-fuchsia-600 disabled:opacity-50 px-4 py-1.5 text-sm font-medium"
        >
          {rendering ? "Rendering…" : "🎬 Render video"}
        </button>
        {savedAt && <span className="text-xs text-emerald-400">✓</span>}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {project.status === "ERROR" && (
        <p className="text-sm text-red-400">Render failed: {project.error}</p>
      )}
      {project.status === "DONE" && project.outputUrl && (
        <div className="rounded-xl bg-slate-900 border border-emerald-800/40 p-4 space-y-2">
          <video controls src={project.outputUrl} className="w-full max-h-96 rounded-lg" />
          <div className="flex flex-wrap gap-4 text-sm">
            <a href={project.outputUrl} download className="text-emerald-400 hover:underline">
              ⬇ Download MP4
            </a>
            {project.captionSrtUrl && (
              <a href={project.captionSrtUrl} download className="text-emerald-400 hover:underline">
                ⬇ Captions (.srt)
              </a>
            )}
            {project.captionVttUrl && (
              <a href={project.captionVttUrl} download className="text-emerald-400 hover:underline">
                ⬇ Captions (.vtt)
              </a>
            )}
          </div>
        </div>
      )}

      {/* pre-generation options */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3">
        <p className="text-xs uppercase tracking-wide text-slate-500">1 — Setup</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="block text-[11px] text-slate-500">
            Size
            <select
              value={project.aspect}
              onChange={(e) => setProject({ ...project, aspect: e.target.value as "16:9" | "9:16" })}
              className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs"
            >
              <option value="16:9">Landscape 16:9</option>
              <option value="9:16">Vertical 9:16</option>
            </select>
          </label>
          <label className="block text-[11px] text-slate-500">
            Target length
            <select
              value={project.targetSeconds}
              onChange={(e) => {
                const s = Number(e.target.value);
                setProject({ ...project, targetSeconds: s });
                setSceneCount(Math.max(2, Math.round(s / 10)));
              }}
              className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs"
            >
              {[30, 60, 90, 120, 180, 300, 600].map((s) => (
                <option key={s} value={s}>
                  {s < 60 ? `${s}s` : `${s / 60} min`}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] text-slate-500">
            Visuals
            <select
              value={project.visualMode}
              onChange={(e) => setProject({ ...project, visualMode: e.target.value })}
              className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs"
            >
              <option value="search">Free search (SearxNG/stock)</option>
              <option value="ai">AI image generation</option>
            </select>
          </label>
          <label className="block text-[11px] text-slate-500">
            Script language
            <select
              value={project.scriptLang}
              onChange={(e) => setProject({ ...project, scriptLang: e.target.value })}
              className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs"
              title="Force the narration language. Auto keeps the article's language; pick a language to translate."
            >
              {SCRIPT_LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] text-slate-500">
            Script model (blank = default)
            <input
              value={project.scriptModel}
              placeholder="e.g. openai/gpt-4o"
              onChange={(e) => setProject({ ...project, scriptModel: e.target.value })}
              className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs"
            />
          </label>
        </div>
      </div>

      {/* script generation */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          2 — Script (prompt is editable before generating)
        </p>
        <textarea
          value={project.scriptPrompt}
          onChange={(e) => setProject({ ...project, scriptPrompt: e.target.value })}
          rows={4}
          className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-slate-400">
            Scenes:
            <input
              type="number"
              min={2}
              max={200}
              value={sceneCount}
              onChange={(e) => setSceneCount(Number(e.target.value))}
              className="ml-2 w-16 rounded-lg bg-slate-800 border border-slate-700 px-2 py-1 text-xs"
            />
          </label>
          <button
            onClick={async () => {
              await save();
              generateScript();
            }}
            disabled={generating}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-1.5 text-sm font-medium"
          >
            {generating ? "Generating…" : project.scenes.length ? "↻ Regenerate script" : "✨ Generate script"}
          </button>
          <button
            onClick={generateMeta}
            disabled={metaBusy}
            className="rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 px-3 py-1.5 text-xs"
          >
            {metaBusy ? "…" : "✦ AI caption / tags"}
          </button>
        </div>
        {project.smCaption && (
          <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 space-y-2 text-xs">
            <MetaRow label="Highlight" value={project.smHighlight} />
            <MetaRow label="Caption" value={project.smCaption} />
            <MetaRow label="Description" value={project.smDescription} />
            <MetaRow label="Tags" value={project.smTags} />
          </div>
        )}
      </div>

      {/* scenes */}
      {project.scenes.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            3 — Scenes ({project.scenes.length})
          </p>
          {project.scenes.map((scene, i) => (
            <div
              key={scene.id}
              className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex gap-4 flex-wrap"
            >
              <div className="w-44 shrink-0 space-y-2">
                <button
                  onClick={() => setPickerScene(pickerScene === scene.id ? null : scene.id)}
                  className="block w-full rounded-lg overflow-hidden border border-slate-700 hover:border-indigo-500 bg-slate-800 relative mx-auto"
                  style={{
                    aspectRatio: project.aspect === "9:16" ? "9 / 16" : "16 / 9",
                    maxWidth: project.aspect === "9:16" ? "100px" : "176px",
                  }}
                  title="Change visual"
                >
                  {scene.imageUrl && VIDEO_URL.test(scene.imageUrl) ? (
                    <>
                      <video
                        src={proxied(scene.imageUrl)}
                        muted
                        preload="metadata"
                        className="w-full h-full"
                        style={{
                          objectFit: scene.fit === "cover" ? "cover" : "contain",
                          objectPosition: `${(scene.focusX ?? 0.5) * 100}% ${(scene.focusY ?? 0.5) * 100}%`,
                        }}
                      />
                      <span className="absolute bottom-1 right-1 text-[10px] bg-black/70 rounded px-1">
                        🎬
                      </span>
                    </>
                  ) : scene.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={proxied(scene.imageUrl)}
                      alt=""
                      className="w-full h-full"
                      style={{
                        objectFit: scene.fit === "cover" ? "cover" : "contain",
                        objectPosition: `${(scene.focusX ?? 0.5) * 100}% ${(scene.focusY ?? 0.5) * 100}%`,
                      }}
                    />
                  ) : (
                    <span className="text-[11px] text-slate-500 flex items-center justify-center h-full p-2 text-center">
                      pick visual
                    </span>
                  )}
                </button>
                <select
                  value={scene.fit}
                  onChange={(e) => patchLocalScene(scene.id, { fit: e.target.value })}
                  className="w-full rounded bg-slate-800 border border-slate-700 px-1 py-1 text-[11px]"
                  title="How the image fits the frame"
                >
                  <option value="cover">Fill (crop)</option>
                  <option value="blur">Fit + blurred bg</option>
                  <option value="contain">Fit (letterbox)</option>
                </select>
                {scene.fit === "cover" && (
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-500">
                      Focus ↔
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.02}
                        value={scene.focusX ?? 0.5}
                        onChange={(e) => patchLocalScene(scene.id, { focusX: Number(e.target.value) })}
                        className="w-full accent-indigo-500"
                      />
                    </label>
                    <label className="block text-[10px] text-slate-500">
                      Focus ↕
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.02}
                        value={scene.focusY ?? 0.5}
                        onChange={(e) => patchLocalScene(scene.id, { focusY: Number(e.target.value) })}
                        className="w-full accent-indigo-500"
                      />
                    </label>
                    <label className="block text-[10px] text-slate-500">
                      Zoom {(scene.zoom ?? 1).toFixed(2)}×
                      <input
                        type="range"
                        min={1}
                        max={2.5}
                        step={0.05}
                        value={scene.zoom ?? 1}
                        onChange={(e) => patchLocalScene(scene.id, { zoom: Number(e.target.value) })}
                        className="w-full accent-indigo-500"
                      />
                    </label>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    value={scene.kenburns}
                    onChange={(e) => patchLocalScene(scene.id, { kenburns: e.target.value })}
                    className="rounded bg-slate-800 border border-slate-700 px-1 py-1 text-[11px]"
                    title="Motion"
                  >
                    <option value="in">Zoom in</option>
                    <option value="out">Zoom out</option>
                    <option value="left">Pan left</option>
                    <option value="right">Pan right</option>
                    <option value="none">Still</option>
                  </select>
                  <select
                    value={scene.transition}
                    onChange={(e) => patchLocalScene(scene.id, { transition: e.target.value })}
                    className="rounded bg-slate-800 border border-slate-700 px-1 py-1 text-[11px]"
                    title="Transition"
                  >
                    <option value="fade">Fade</option>
                    <option value="cut">Cut</option>
                  </select>
                </div>
              </div>

              <div className="flex-1 min-w-64 space-y-2">
                <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                  <span className="rounded bg-slate-800 px-1.5 py-0.5">#{i + 1}</span>
                  {scene.ttsUrl ? (
                    <span>{scene.durationSec.toFixed(1)}s (voiceover)</span>
                  ) : (
                    <label title="Scene duration (no voiceover)">
                      <input
                        type="number"
                        min={1}
                        max={60}
                        step={0.5}
                        value={scene.durationSec}
                        onChange={(e) =>
                          patchLocalScene(scene.id, { durationSec: Number(e.target.value) })
                        }
                        className="w-14 rounded bg-slate-800 border border-slate-700 px-1 py-0.5 text-[11px]"
                      />
                      s
                    </label>
                  )}
                  {scene.ttsUrl && (
                    <audio controls preload="none" src={scene.ttsUrl} className="h-7" />
                  )}
                  <select
                    value={scene.voiceId}
                    onChange={(e) => patchLocalScene(scene.id, { voiceId: e.target.value })}
                    className="rounded bg-slate-800 border border-slate-700 px-1 py-0.5 text-[11px] max-w-32"
                    title="Voice for this scene"
                  >
                    <option value="">Project voice</option>
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => moveScene(scene.id, "up")}
                      disabled={i === 0}
                      title="Move up"
                      className="rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 px-1.5 py-1"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveScene(scene.id, "down")}
                      disabled={i === project.scenes.length - 1}
                      title="Move down"
                      className="rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 px-1.5 py-1"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => deleteScene(scene.id)}
                      title="Remove scene"
                      className="rounded bg-red-900/40 text-red-300 hover:bg-red-900/70 px-1.5 py-1"
                    >
                      ✕
                    </button>
                    <button
                      onClick={() => generateTts(scene.id)}
                      disabled={busyScene === scene.id}
                      className="rounded-lg bg-indigo-600/80 hover:bg-indigo-500 disabled:opacity-50 px-2.5 py-1 text-[11px] font-medium text-white"
                    >
                      {busyScene === scene.id ? "…" : scene.ttsUrl ? "↻ Voiceover" : "🎙 Voiceover"}
                    </button>
                  </div>
                </div>
                <textarea
                  dir="auto"
                  value={scene.text}
                  onChange={(e) => patchLocalScene(scene.id, { text: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
                {pickerScene === scene.id && (
                  <ScenePicker
                    scene={scene}
                    item={project.item ?? null}
                    onPicked={(url, extra) => {
                      patchLocalScene(scene.id, { imageUrl: url, ...extra });
                      setPickerScene(null);
                    }}
                    onSceneUpdated={(u) => patchLocalScene(scene.id, u)}
                    saveAll={() => save()}
                  />
                )}
              </div>
            </div>
          ))}
          <button
            onClick={() => addScene(-1)}
            className="w-full rounded-xl border border-dashed border-slate-700 hover:border-indigo-500 py-2.5 text-sm text-slate-400 hover:text-indigo-300"
          >
            + Add scene
          </button>
        </div>
      )}
      {project.scenes.length === 0 && (
        <button
          onClick={() => addScene(-1)}
          className="w-full max-w-md rounded-xl border border-dashed border-slate-700 hover:border-indigo-500 py-2.5 text-sm text-slate-400 hover:text-indigo-300"
        >
          + Add scene manually (or generate a script above)
        </button>
      )}
    </div>
  );
}

function ScenePicker({
  scene,
  item,
  onPicked,
  onSceneUpdated,
  saveAll,
}: {
  scene: SceneDto;
  item: NewsItemDto | null;
  onPicked: (url: string, extra?: Partial<SceneDto>) => void;
  onSceneUpdated: (u: Partial<SceneDto>) => void;
  saveAll: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"article" | "search" | "ai" | "upload">("article");
  const [source, setSource] = useState<"searxng" | "pexels" | "pixabay">("searxng");
  const [kind, setKind] = useState<"image" | "video">("image");
  const [query, setQuery] = useState(scene.imageQuery || "");
  const [prompt, setPrompt] = useState(scene.imagePrompt || scene.text.slice(0, 140));
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const articleMedia = useMemo(
    () => item?.media?.filter((m) => m.type === "IMAGE" || m.type === "VIDEO") ?? [],
    [item],
  );

  async function search() {
    setBusy(true);
    setErr("");
    setResults([]);
    const res = await fetch(
      `/api/search/media?q=${encodeURIComponent(query)}&source=${source}&kind=${kind}`,
    );
    setBusy(false);
    if (res.ok) setResults((await res.json()).results);
    else setErr((await res.json()).error ?? "Search failed");
  }

  async function generate(kind: "image" | "video") {
    setBusy(true);
    setErr("");
    await saveAll();
    const res = await fetch(`/api/scenes/${scene.id}/gen${kind === "image" ? "image" : "video"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    setBusy(false);
    if (res.ok) {
      const updated = await res.json();
      onSceneUpdated({ imageUrl: updated.imageUrl, imagePrompt: prompt });
    } else setErr((await res.json()).error ?? "Generation failed");
  }

  async function upload(file: File) {
    setBusy(true);
    setErr("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: form });
    setBusy(false);
    if (res.ok) onPicked((await res.json()).url);
    else setErr((await res.json()).error ?? "Upload failed");
  }

  const tabCls = (t: string) =>
    `rounded-md px-2.5 py-1 text-[11px] font-medium ${
      tab === t ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
    }`;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950 p-3 space-y-2">
      <div className="flex gap-1">
        <button className={tabCls("article")} onClick={() => setTab("article")}>
          Article media
        </button>
        <button className={tabCls("search")} onClick={() => setTab("search")}>
          Search
        </button>
        <button className={tabCls("ai")} onClick={() => setTab("ai")}>
          AI generate
        </button>
        <button className={tabCls("upload")} onClick={() => setTab("upload")}>
          Upload
        </button>
      </div>

      {tab === "article" && (
        <div className="grid grid-cols-6 gap-1.5">
          {articleMedia.map((m) => (
            <button
              key={m.id}
              onClick={() => onPicked(m.url)}
              className="aspect-square rounded overflow-hidden border border-slate-700 hover:border-indigo-500 bg-slate-800"
              title={m.source}
            >
              {m.type === "IMAGE" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxied(m.url)} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-lg">🎬</span>
              )}
            </button>
          ))}
          {articleMedia.length === 0 && (
            <p className="col-span-6 text-[11px] text-slate-600">No media in this article.</p>
          )}
        </div>
      )}

      {tab === "search" && (
        <div className="space-y-2">
          <div className="flex gap-1.5">
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as typeof source)}
              className="rounded bg-slate-800 border border-slate-700 px-1.5 py-1 text-[11px]"
            >
              <option value="searxng">SearxNG</option>
              <option value="pexels">Pexels</option>
              <option value="pixabay">Pixabay</option>
            </select>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              className="rounded bg-slate-800 border border-slate-700 px-1.5 py-1 text-[11px]"
            >
              <option value="image">Images</option>
              <option value="video">Videos</option>
            </select>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="Edit search query…"
              className="flex-1 rounded bg-slate-800 border border-slate-700 px-2 py-1 text-[11px]"
            />
            <button
              onClick={search}
              disabled={busy || !query.trim()}
              className="rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-1 text-[11px] font-medium"
            >
              {busy ? "…" : "Search"}
            </button>
          </div>
          <div className="grid grid-cols-6 gap-1.5 max-h-48 overflow-y-auto">
            {results.map((r, i) => (
              <button
                key={i}
                onClick={() => onPicked(r.url, { imageQuery: query })}
                className="aspect-square rounded overflow-hidden border border-slate-700 hover:border-indigo-500 bg-slate-800"
                title={`${r.title} (${r.source})`}
              >
                {r.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proxied(r.thumb)} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <span className="text-lg">🎬</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "ai" && (
        <div className="space-y-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            placeholder="Prompt (editable before generating)"
            className="w-full rounded bg-slate-800 border border-slate-700 px-2 py-1.5 text-[11px]"
          />
          <div className="flex gap-2">
            <button
              onClick={() => generate("image")}
              disabled={busy || !prompt.trim()}
              className="rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-1 text-[11px] font-medium"
            >
              {busy ? "Generating…" : "✨ Generate image"}
            </button>
            <button
              onClick={() => generate("video")}
              disabled={busy || !prompt.trim()}
              title="AI-animate this scene (uses the current image when set)"
              className="rounded bg-fuchsia-700 hover:bg-fuchsia-600 disabled:opacity-50 px-3 py-1 text-[11px] font-medium"
            >
              {busy ? "Generating…" : "🎬 Generate video"}
            </button>
          </div>
          <p className="text-[10px] text-slate-600">
            Video generation animates the scene with the AI video model from Settings;
            with an image selected it animates that image.
          </p>
        </div>
      )}

      {tab === "upload" && (
        <div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 px-3 py-1.5 text-[11px]"
          >
            {busy ? "Uploading…" : "⬆ Choose image/video"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {err && <p className="text-[11px] text-red-400">{err}</p>}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="text-slate-500 w-20 shrink-0">{label}</span>
      <span dir="auto" className="flex-1 text-slate-200 break-words">
        {value}
      </span>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="text-slate-500 hover:text-white shrink-0"
      >
        {copied ? "✓" : "copy"}
      </button>
    </div>
  );
}
