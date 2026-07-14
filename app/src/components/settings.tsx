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
  wordsPerGroup: number;
  position: "bottom" | "middle" | "top";
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
                <option value="bottom">Bottom</option>
                <option value="middle">Middle</option>
                <option value="top">Top</option>
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
