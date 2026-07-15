"use client";

import { useEffect, useState } from "react";

type Def = { key: string; label: string; secret: boolean; def: string };

export function Settings() {
  const [defs, setDefs] = useState<Def[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [mock, setMock] = useState<{ ai: boolean; tts: boolean }>({ ai: true, tts: true });
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setDefs([...d.defs]);
        setValues(d.values);
        setMock(d.mock);
      });
  }, []);

  async function save() {
    setError("");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (res.ok) {
      setSavedAt(Date.now());
      const d = await fetch("/api/settings").then((r) => r.json());
      setMock(d.mock);
    } else {
      const d = await res.json();
      setError(d.error ?? "Save failed");
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-slate-500">
          AI providers, model selection, and media search sources used by
          article→video generation.
        </p>
      </div>

      {(mock.ai || mock.tts) && (
        <div className="rounded-xl border border-amber-700/50 bg-amber-900/20 p-3 text-xs text-amber-300">
          {mock.ai && <p>⚠ No fal.ai key — script &amp; image generation run in mock mode.</p>}
          {mock.tts && <p>⚠ No ElevenLabs key — voiceover runs in mock mode (tone placeholder).</p>}
        </div>
      )}

      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3">
        {defs.map((def) => (
          <label key={def.key} className="block text-xs text-slate-400">
            {def.label}
            <input
              type={def.secret ? "password" : "text"}
              value={values[def.key] ?? ""}
              placeholder={def.def || (def.secret ? "not set" : "")}
              onChange={(e) => setValues({ ...values, [def.key]: e.target.value })}
              className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </label>
        ))}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={save}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-medium"
          >
            Save settings
          </button>
          {savedAt && <span className="text-xs text-emerald-400">Saved ✓</span>}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      </div>

      <p className="text-[11px] text-slate-600">
        SearxNG URL defaults to the bundled Docker container (http://searxng:8080). Model
        names follow fal.ai identifiers — e.g. openai/gpt-4o, anthropic/claude-sonnet-5,
        fal-ai/flux/schnell.
      </p>

      <CaptionStyles />
    </div>
  );
}

type StyleSpec = {
  fontSize: number;
  baseColor: string;
  activeColor: string;
  outlineColor: string;
  outlineWidth: number;
  bold: boolean;
  uppercase: boolean;
  wordsPerGroup?: number;
  position: "top" | "upper" | "middle" | "lower" | "bottom";
  maxWidthPercent?: number;
  // grouping
  minWords?: number;
  maxWords?: number;
  targetWords?: number;
  minDurationMs?: number;
  maxDurationMs?: number;
  followVoicePauses?: boolean;
  keepNumbersWithUnits?: boolean;
  allowSingleWordEmphasisGroup?: boolean;
  // highlight
  highlightMode?: "color" | "background" | "pill" | "underline";
  activeBg?: string;
  activeScale?: number;
  transitionMs?: number;
  holdUntilNextWord?: boolean;
  // motion
  groupEntrance?: "none" | "fade" | "pop";
  groupExit?: "none" | "fade";
  reducedMotion?: boolean;
};
type CaptionStyleDto = { id: string; name: string; builtin: boolean; style: StyleSpec };

function CaptionStyles() {
  const [styles, setStyles] = useState<CaptionStyleDto[]>([]);
  const [selected, setSelected] = useState<CaptionStyleDto | null>(null);
  const [err, setErr] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/captions").then((r) => r.json()).then(setStyles);
  }, []);

  function patch(p: Partial<StyleSpec>) {
    if (!selected) return;
    setSelected({ ...selected, style: { ...selected.style, ...p } });
  }

  async function save() {
    if (!selected) return;
    setErr("");
    const res = await fetch(`/api/captions/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: selected.name, style: selected.style }),
    });
    if (res.ok) {
      setSavedAt(Date.now());
      setStyles((prev) => prev.map((s) => (s.id === selected.id ? selected : s)));
    } else setErr((await res.json()).error ?? "Save failed");
  }

  async function duplicate() {
    if (!selected) return;
    const res = await fetch("/api/captions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${selected.name} copy`, style: selected.style }),
    });
    if (res.ok) {
      const created = await res.json();
      setStyles((prev) => [...prev, created]);
      setSelected(created);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this caption style?")) return;
    const res = await fetch(`/api/captions/${id}`, { method: "DELETE" });
    if (res.ok) {
      setStyles((prev) => prev.filter((s) => s.id !== id));
      if (selected?.id === id) setSelected(null);
    } else setErr((await res.json()).error ?? "Delete failed");
  }

  const inputCls =
    "mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500";

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
      <div>
        <p className="text-sm font-medium text-white">Caption styles</p>
        <p className="text-xs text-slate-500">
          Styles used for burned-in captions in article→video renders. Captions can be
          switched on/off per project; the style is chosen in the project editor.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {styles.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelected(s)}
            className={`rounded-lg px-3 py-1.5 text-xs ${
              selected?.id === s.id
                ? "bg-indigo-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {s.name}
            {s.builtin && " ★"}
          </button>
        ))}
      </div>
      {selected && (
        <div className="space-y-3">
          {/* live preview */}
          <div className="rounded-lg bg-slate-950 border border-slate-800 h-24 flex items-center justify-center overflow-hidden">
            <span
              style={{
                fontSize: Math.min(selected.style.fontSize / 2.2, 30),
                color: selected.style.baseColor,
                fontWeight: selected.style.bold ? 800 : 400,
                WebkitTextStroke: `${Math.min(selected.style.outlineWidth / 2, 3)}px ${selected.style.outlineColor}`,
              }}
            >
              {(selected.style.uppercase ? "breaking news now" : "Breaking news now")
                .split(" ")
                .map((w, i) => (
                  <span key={i} style={i === 1 ? { color: selected.style.activeColor } : {}}>
                    {selected.style.uppercase ? w.toUpperCase() : w}{" "}
                  </span>
                ))}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-xs text-slate-400">
              Name
              <input
                value={selected.name}
                onChange={(e) => setSelected({ ...selected, name: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="block text-xs text-slate-400">
              Font size
              <input
                type="number"
                value={selected.style.fontSize}
                onChange={(e) => patch({ fontSize: Number(e.target.value) })}
                className={inputCls}
              />
            </label>
            <label className="block text-xs text-slate-400">
              Words per group
              <input
                type="number"
                min={1}
                max={12}
                value={selected.style.wordsPerGroup}
                onChange={(e) => patch({ wordsPerGroup: Number(e.target.value) })}
                className={inputCls}
              />
            </label>
            <label className="block text-xs text-slate-400">
              Text color
              <input
                type="color"
                value={selected.style.baseColor}
                onChange={(e) => patch({ baseColor: e.target.value })}
                className="mt-1 w-full h-8 rounded-lg bg-slate-800 border border-slate-700"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Active word
              <input
                type="color"
                value={selected.style.activeColor}
                onChange={(e) => patch({ activeColor: e.target.value })}
                className="mt-1 w-full h-8 rounded-lg bg-slate-800 border border-slate-700"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Outline
              <input
                type="color"
                value={selected.style.outlineColor}
                onChange={(e) => patch({ outlineColor: e.target.value })}
                className="mt-1 w-full h-8 rounded-lg bg-slate-800 border border-slate-700"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Outline width
              <input
                type="number"
                min={0}
                max={12}
                value={selected.style.outlineWidth}
                onChange={(e) => patch({ outlineWidth: Number(e.target.value) })}
                className={inputCls}
              />
            </label>
            <label className="block text-xs text-slate-400">
              Position
              <select
                value={selected.style.position}
                onChange={(e) => patch({ position: e.target.value as StyleSpec["position"] })}
                className={inputCls}
              >
                <option value="top">Top</option>
                <option value="upper">Upper center</option>
                <option value="middle">Center</option>
                <option value="lower">Lower center</option>
                <option value="bottom">Bottom</option>
              </select>
            </label>
            <div className="flex items-end gap-3 pb-1">
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={selected.style.bold}
                  onChange={(e) => patch({ bold: e.target.checked })}
                  className="accent-indigo-600"
                />
                Bold
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={selected.style.uppercase}
                  onChange={(e) => patch({ uppercase: e.target.checked })}
                  className="accent-indigo-600"
                />
                UPPERCASE
              </label>
            </div>
            <label className="block text-xs text-slate-400">
              Max width %
              <input
                type="number"
                min={40}
                max={100}
                value={selected.style.maxWidthPercent ?? 85}
                onChange={(e) => patch({ maxWidthPercent: Number(e.target.value) })}
                className={inputCls}
              />
            </label>
          </div>

          {/* Grouping */}
          <p className="text-[11px] uppercase tracking-wide text-slate-500 pt-1">Caption grouping</p>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-xs text-slate-400">
              Min words
              <input type="number" min={1} max={8} value={selected.style.minWords ?? 2}
                onChange={(e) => patch({ minWords: Number(e.target.value) })} className={inputCls} />
            </label>
            <label className="block text-xs text-slate-400">
              Max words
              <input type="number" min={1} max={12} value={selected.style.maxWords ?? 5}
                onChange={(e) => patch({ maxWords: Number(e.target.value) })} className={inputCls} />
            </label>
            <label className="block text-xs text-slate-400">
              Preferred words
              <input type="number" min={1} max={8} value={selected.style.targetWords ?? 3}
                onChange={(e) => patch({ targetWords: Number(e.target.value) })} className={inputCls} />
            </label>
            <label className="block text-xs text-slate-400">
              Min duration (ms)
              <input type="number" min={200} max={3000} step={50} value={selected.style.minDurationMs ?? 700}
                onChange={(e) => patch({ minDurationMs: Number(e.target.value) })} className={inputCls} />
            </label>
            <label className="block text-xs text-slate-400">
              Max duration (ms)
              <input type="number" min={1000} max={8000} step={100} value={selected.style.maxDurationMs ?? 4000}
                onChange={(e) => patch({ maxDurationMs: Number(e.target.value) })} className={inputCls} />
            </label>
            <div className="flex flex-col justify-end gap-1 pb-1">
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                <input type="checkbox" checked={selected.style.followVoicePauses ?? true}
                  onChange={(e) => patch({ followVoicePauses: e.target.checked })} className="accent-indigo-600" />
                Follow voice pauses
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                <input type="checkbox" checked={selected.style.keepNumbersWithUnits ?? true}
                  onChange={(e) => patch({ keepNumbersWithUnits: e.target.checked })} className="accent-indigo-600" />
                Keep numbers + units
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                <input type="checkbox" checked={selected.style.allowSingleWordEmphasisGroup ?? true}
                  onChange={(e) => patch({ allowSingleWordEmphasisGroup: e.target.checked })} className="accent-indigo-600" />
                Allow 1-word emphasis
              </label>
            </div>
          </div>

          {/* Active-word highlight */}
          <p className="text-[11px] uppercase tracking-wide text-slate-500 pt-1">Active-word highlight</p>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-xs text-slate-400">
              Style
              <select value={selected.style.highlightMode ?? "background"}
                onChange={(e) => patch({ highlightMode: e.target.value as StyleSpec["highlightMode"] })} className={inputCls}>
                <option value="color">Color only</option>
                <option value="background">Background box</option>
                <option value="pill">Pill</option>
                <option value="underline">Underline</option>
              </select>
            </label>
            <label className="block text-xs text-slate-400">
              Highlight bg
              <input type="color" value={selected.style.activeBg ?? "#e11d48"}
                onChange={(e) => patch({ activeBg: e.target.value })}
                className="mt-1 w-full h-8 rounded-lg bg-slate-800 border border-slate-700" />
            </label>
            <label className="block text-xs text-slate-400">
              Active scale
              <input type="number" min={1} max={1.5} step={0.02} value={selected.style.activeScale ?? 1.06}
                onChange={(e) => patch({ activeScale: Number(e.target.value) })} className={inputCls} />
            </label>
            <label className="block text-xs text-slate-400">
              Transition (ms)
              <input type="number" min={0} max={600} step={10} value={selected.style.transitionMs ?? 140}
                onChange={(e) => patch({ transitionMs: Number(e.target.value) })} className={inputCls} />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-400 pb-1 self-end">
              <input type="checkbox" checked={selected.style.holdUntilNextWord ?? true}
                onChange={(e) => patch({ holdUntilNextWord: e.target.checked })} className="accent-indigo-600" />
              Hold until next word
            </label>
          </div>

          {/* Motion */}
          <p className="text-[11px] uppercase tracking-wide text-slate-500 pt-1">Motion</p>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-xs text-slate-400">
              Group entrance
              <select value={selected.style.groupEntrance ?? "pop"}
                onChange={(e) => patch({ groupEntrance: e.target.value as StyleSpec["groupEntrance"] })} className={inputCls}>
                <option value="none">None</option>
                <option value="fade">Fade</option>
                <option value="pop">Pop</option>
              </select>
            </label>
            <label className="block text-xs text-slate-400">
              Group exit
              <select value={selected.style.groupExit ?? "fade"}
                onChange={(e) => patch({ groupExit: e.target.value as StyleSpec["groupExit"] })} className={inputCls}>
                <option value="none">None</option>
                <option value="fade">Fade</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-400 pb-1 self-end">
              <input type="checkbox" checked={selected.style.reducedMotion ?? false}
                onChange={(e) => patch({ reducedMotion: e.target.checked })} className="accent-indigo-600" />
              Reduced motion
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 text-sm font-medium"
            >
              Save style
            </button>
            <button
              onClick={duplicate}
              className="rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs"
            >
              Duplicate
            </button>
            {!selected.builtin && (
              <button
                onClick={() => remove(selected.id)}
                className="text-xs text-slate-500 hover:text-red-400"
              >
                Delete
              </button>
            )}
            {savedAt && <span className="text-xs text-emerald-400">Saved ✓</span>}
            {err && <span className="text-xs text-red-400">{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
