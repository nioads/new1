"use client";

import { useEffect, useRef, useState } from "react";

export type MusicTrackDto = {
  id: string;
  name: string;
  url: string;
  durationSec: number;
  source: string;
  createdAt: string;
};

export function Music() {
  const [tracks, setTracks] = useState<MusicTrackDto[]>([]);
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/music").then((r) => r.json()).then(setTracks);
  }, []);

  async function upload(file: File) {
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/music", { method: "POST", body: form });
    setBusy(false);
    const data = await res.json();
    if (res.ok) setTracks((prev) => [data, ...prev]);
    else setError(data.error ?? "Upload failed");
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/music/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, durationSec: duration }),
    });
    setBusy(false);
    const data = await res.json();
    if (res.ok) {
      setTracks((prev) => [data, ...prev]);
      setPrompt("");
    } else setError(data.error ?? "Generation failed");
  }

  async function remove(id: string) {
    if (!confirm("Delete this track?")) return;
    const res = await fetch(`/api/music/${id}`, { method: "DELETE" });
    if (res.ok) setTracks((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Music library</h1>
        <p className="text-sm text-slate-500">
          Background tracks for video posts and article→video renders. Upload your own
          or generate with ElevenLabs (key required in Settings).
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 px-4 py-2 text-sm"
        >
          ⬆ Upload audio
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        <form onSubmit={generate} className="flex flex-1 min-w-72 gap-2">
          <input
            required
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Generate: e.g. tense breaking-news underscore, pulsing synths"
            className="flex-1 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-2 text-sm"
          >
            {[15, 30, 60, 90].map((d) => (
              <option key={d} value={d}>
                {d}s
              </option>
            ))}
          </select>
          <button
            disabled={busy}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium"
          >
            {busy ? "Working…" : "♫ Generate"}
          </button>
        </form>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}

      <ul className="space-y-2">
        {tracks.map((t) => (
          <li
            key={t.id}
            className="rounded-xl bg-slate-900 border border-slate-800 p-3 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{t.name}</p>
              <p className="text-[11px] text-slate-500">
                {t.source}
                {t.durationSec ? ` · ${Math.round(t.durationSec)}s` : ""}
              </p>
            </div>
            <audio controls preload="none" src={t.url} className="h-8 max-w-56" />
            <button
              onClick={() => remove(t.id)}
              className="text-xs text-slate-500 hover:text-red-400"
            >
              Delete
            </button>
          </li>
        ))}
        {tracks.length === 0 && (
          <li className="text-sm text-slate-500">No tracks yet — upload or generate one.</li>
        )}
      </ul>
    </div>
  );
}
