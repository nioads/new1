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
    </div>
  );
}
