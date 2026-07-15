"use client";

// Compact inline caption-style editor for the article→video project editor, so
// caption size / colors / position / highlight are adjustable right where the
// video is built (not only in Settings). Edits the selected preset via the
// caption-styles API. Full controls live in Settings → Caption styles.
import { useState } from "react";

export type QuickStyle = {
  fontSize: number;
  baseColor: string;
  activeColor: string;
  activeBg?: string;
  outlineColor: string;
  outlineWidth: number;
  bold: boolean;
  position: "top" | "upper" | "middle" | "lower" | "bottom";
  highlightMode?: "color" | "background" | "pill" | "underline";
  [k: string]: unknown;
};
export type CaptionStyleItem = { id: string; name: string; builtin: boolean; style: QuickStyle };

const DEFAULT_STYLE: QuickStyle = {
  fontSize: 64,
  baseColor: "#ffffff",
  activeColor: "#ffd900",
  activeBg: "#e11d48",
  outlineColor: "#000000",
  outlineWidth: 5,
  bold: true,
  position: "lower",
  highlightMode: "background",
};

export function CaptionStyleQuick({
  styles,
  styleId,
  onSelect,
  onStylesChange,
}: {
  styles: CaptionStyleItem[];
  styleId: string | null;
  onSelect: (id: string | null) => void;
  onStylesChange: (styles: CaptionStyleItem[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = styles.find((s) => s.id === styleId) ?? null;

  async function createEditable() {
    setBusy(true);
    try {
      const res = await fetch("/api/captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My caption style", style: current?.style ?? DEFAULT_STYLE }),
      });
      if (res.ok) {
        const created = (await res.json()) as CaptionStyleItem;
        onStylesChange([...styles, created]);
        onSelect(created.id);
        setOpen(true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function patchStyle(p: Partial<QuickStyle>) {
    if (!current) return;
    const nextStyle = { ...current.style, ...p };
    const next = { ...current, style: nextStyle };
    onStylesChange(styles.map((s) => (s.id === current.id ? next : s)));
    await fetch(`/api/captions/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: current.name, style: nextStyle }),
    }).catch(() => {});
  }

  return (
    <span className="relative inline-flex items-center gap-1.5">
      <button
        onClick={() => (current ? setOpen((o) => !o) : createEditable())}
        disabled={busy}
        className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-50"
        title="Adjust caption size, colors and position"
      >
        {current ? (open ? "Close style ✕" : "✎ Caption size & color") : "✎ Customize captions"}
      </button>

      {open && current && (
        <div className="absolute z-20 mt-2 w-72 rounded-xl bg-slate-900 border border-slate-700 p-3 shadow-xl space-y-2" style={{ transform: "translateY(2.2rem)" }}>
          <p className="text-[11px] text-slate-400">
            Editing <span className="text-slate-200">{current.name}</span>
          </p>
          <label className="block text-[11px] text-slate-400">
            Font size: {current.style.fontSize}
            <input
              type="range"
              min={28}
              max={110}
              value={current.style.fontSize}
              onChange={(e) => patchStyle({ fontSize: Number(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-slate-400">
              Text
              <input type="color" value={current.style.baseColor} onChange={(e) => patchStyle({ baseColor: e.target.value })} className="mt-1 w-full h-7 rounded bg-slate-800 border border-slate-700" />
            </label>
            <label className="text-[11px] text-slate-400">
              Active word
              <input type="color" value={current.style.activeColor} onChange={(e) => patchStyle({ activeColor: e.target.value })} className="mt-1 w-full h-7 rounded bg-slate-800 border border-slate-700" />
            </label>
            <label className="text-[11px] text-slate-400">
              Highlight bg
              <input type="color" value={current.style.activeBg ?? "#e11d48"} onChange={(e) => patchStyle({ activeBg: e.target.value })} className="mt-1 w-full h-7 rounded bg-slate-800 border border-slate-700" />
            </label>
            <label className="text-[11px] text-slate-400">
              Outline
              <input type="color" value={current.style.outlineColor} onChange={(e) => patchStyle({ outlineColor: e.target.value })} className="mt-1 w-full h-7 rounded bg-slate-800 border border-slate-700" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-slate-400">
              Position
              <select value={current.style.position} onChange={(e) => patchStyle({ position: e.target.value as QuickStyle["position"] })} className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-1.5 py-1 text-xs">
                <option value="top">Top</option>
                <option value="upper">Upper</option>
                <option value="middle">Center</option>
                <option value="lower">Lower</option>
                <option value="bottom">Bottom</option>
              </select>
            </label>
            <label className="text-[11px] text-slate-400">
              Highlight
              <select value={current.style.highlightMode ?? "background"} onChange={(e) => patchStyle({ highlightMode: e.target.value as QuickStyle["highlightMode"] })} className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-1.5 py-1 text-xs">
                <option value="color">Color</option>
                <option value="background">Box</option>
                <option value="pill">Pill</option>
                <option value="underline">Underline</option>
              </select>
            </label>
          </div>
          <p className="text-[10px] text-slate-500">Changes save to this style and apply on the next preview / render.</p>
        </div>
      )}
    </span>
  );
}
