"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  Aspect,
  TemplateDto,
  TemplateElement,
  TextElement,
  VariantDto,
} from "@/lib/template-types";
import { elementId } from "@/lib/template-types";
import type { BrandDto } from "@/lib/types";
import { TemplateCanvas, type Bindings } from "@/components/canvas/template-canvas";

const PREVIEW_BINDINGS: Bindings = {
  headline: "Major story headline appears in this position",
  subtext: "Short summary of the story is rendered here.",
  source: "News Studio Wire",
  date: new Date().toLocaleDateString(),
};

const CANVAS_BOX = 640;

export function TemplateEditor({ templateId }: { templateId: string }) {
  const [template, setTemplate] = useState<TemplateDto | null>(null);
  const [brands, setBrands] = useState<BrandDto[]>([]);
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/templates/${templateId}`)
      .then((r) => r.json())
      .then(setTemplate);
    fetch("/api/brands").then((r) => r.json()).then(setBrands);
  }, [templateId]);

  const variant = useMemo(
    () => template?.variants.find((v) => v.aspect === aspect) ?? null,
    [template, aspect],
  );
  const brand = useMemo(
    () => brands.find((b) => b.id === template?.brandId) ?? null,
    [brands, template?.brandId],
  );
  const selected = variant?.elements.find((e) => e.id === selectedId) ?? null;

  const setVariantElements = useCallback(
    (elements: TemplateElement[]) => {
      setTemplate((prev) =>
        prev
          ? {
              ...prev,
              variants: prev.variants.map((v) =>
                v.aspect === aspect ? { ...v, elements } : v,
              ),
            }
          : prev,
      );
    },
    [aspect],
  );

  const updateElement = useCallback(
    (el: TemplateElement) => {
      if (!variant) return;
      setVariantElements(variant.elements.map((e) => (e.id === el.id ? el : e)));
    },
    [variant, setVariantElements],
  );

  function addElement(kind: "text" | "badge" | "rect" | "logo" | "image") {
    if (!variant) return;
    const w = variant.width;
    const base = { id: elementId(), x: Math.round(w * 0.1), y: Math.round(w * 0.1) };
    let el: TemplateElement;
    if (kind === "text" || kind === "badge") {
      el = {
        ...base,
        kind: "text",
        role: "static",
        text: kind === "badge" ? "BADGE" : "Text",
        width: Math.round(w * 0.4),
        height: kind === "badge" ? 70 : 120,
        fontSize: kind === "badge" ? 36 : 48,
        fontWeight: "bold",
        fill: "#ffffff",
        align: kind === "badge" ? "center" : "left",
        ...(kind === "badge" ? { bgColor: "#dc2626", padding: 10 } : {}),
      } as TextElement;
    } else if (kind === "rect") {
      el = {
        ...base,
        kind: "rect",
        width: Math.round(w * 0.5),
        height: Math.round(w * 0.2),
        fill: "rgba(0,0,0,0.6)",
      };
    } else if (kind === "logo") {
      el = { ...base, kind: "logo", width: Math.round(w * 0.14), height: Math.round(w * 0.14) };
    } else {
      el = {
        ...base,
        kind: "image",
        role: "static",
        width: Math.round(w * 0.4),
        height: Math.round(w * 0.3),
        zoom: 1,
      };
    }
    setVariantElements([...variant.elements, el]);
    setSelectedId(el.id);
  }

  function removeSelected() {
    if (!variant || !selectedId) return;
    setVariantElements(variant.elements.filter((e) => e.id !== selectedId));
    setSelectedId(null);
  }

  function move(dir: -1 | 1) {
    if (!variant || !selectedId) return;
    const idx = variant.elements.findIndex((e) => e.id === selectedId);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= variant.elements.length) return;
    const els = [...variant.elements];
    [els[idx], els[next]] = [els[next], els[idx]];
    setVariantElements(els);
  }

  function copyFrom(sourceAspect: Aspect) {
    if (!template || !variant) return;
    const src = template.variants.find((v) => v.aspect === sourceAspect);
    if (!src) return;
    // scale positions proportionally between canvas sizes
    const sx = variant.width / src.width;
    const sy = variant.height / src.height;
    const scaled = src.elements.map((e) => ({
      ...e,
      id: elementId(),
      x: Math.round(e.x * sx),
      y: Math.round(e.y * sy),
      width: Math.round(e.width * sx),
      height: Math.round(e.height * sy),
      ...(e.kind === "text"
        ? { fontSize: Math.round((e as TextElement).fontSize * sx) }
        : {}),
    }));
    setVariantElements(scaled as TemplateElement[]);
  }

  async function save() {
    if (!template) return;
    setSaving(true);
    const res = await fetch(`/api/templates/${template.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: template.name,
        brandId: template.brandId,
        variants: template.variants.map((v: VariantDto) => ({
          aspect: v.aspect,
          elements: v.elements,
        })),
      }),
    });
    setSaving(false);
    if (res.ok) setSavedAt(Date.now());
  }

  if (!template || !variant) {
    return <div className="p-10 text-slate-500 text-sm">Loading template…</div>;
  }

  const scale = Math.min(CANVAS_BOX / variant.width, CANVAS_BOX / variant.height);

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
        <Link href="/templates" className="text-slate-400 hover:text-white text-sm">
          ← Templates
        </Link>
        <input
          value={template.name}
          onChange={(e) => setTemplate({ ...template, name: e.target.value })}
          className="bg-transparent border border-transparent hover:border-slate-700 focus:border-indigo-500 rounded-lg px-2 py-1 text-white font-medium focus:outline-none"
        />
        <select
          value={template.brandId ?? ""}
          onChange={(e) => setTemplate({ ...template, brandId: e.target.value || null })}
          className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-sm"
        >
          <option value="">No brand</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          {savedAt && <span className="text-xs text-emerald-400">Saved ✓</span>}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-1.5 text-sm font-medium"
          >
            {saving ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* left: layers + add */}
        <div className="w-56 shrink-0 border-r border-slate-800 p-3 space-y-3 overflow-y-auto">
          <div className="flex flex-wrap gap-1.5">
            {(["text", "badge", "rect", "image", "logo"] as const).map((k) => (
              <button
                key={k}
                onClick={() => addElement(k)}
                className="rounded-lg bg-slate-800 hover:bg-slate-700 px-2 py-1 text-xs capitalize"
              >
                + {k}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            {[...variant.elements].reverse().map((el) => (
              <button
                key={el.id}
                onClick={() => setSelectedId(el.id)}
                className={`w-full text-left rounded-lg px-2 py-1.5 text-xs truncate ${
                  selectedId === el.id
                    ? "bg-indigo-600/20 text-indigo-300"
                    : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                {el.kind === "text"
                  ? `${(el as TextElement).role}: ${(el as TextElement).text.slice(0, 18)}`
                  : el.kind}
              </button>
            ))}
          </div>
        </div>

        {/* center: canvas */}
        <div className="flex-1 min-w-0 flex flex-col items-center overflow-auto p-4 gap-3">
          <div className="flex gap-1 rounded-lg bg-slate-900 border border-slate-800 p-1">
            {template.variants.map((v) => (
              <button
                key={v.aspect}
                onClick={() => {
                  setAspect(v.aspect);
                  setSelectedId(null);
                }}
                className={`rounded-md px-3 py-1 text-xs font-medium ${
                  aspect === v.aspect ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {v.aspect}
              </button>
            ))}
            <button
              onClick={() => {
                const other = template.variants.find((v) => v.aspect !== aspect);
                if (other) copyFrom(other.aspect);
              }}
              title="Copy layout from another size"
              className="rounded-md px-3 py-1 text-xs text-slate-400 hover:text-white"
            >
              ⇆ copy layout
            </button>
          </div>
          <div className="rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
            <TemplateCanvas
              variant={variant}
              bindings={{ ...PREVIEW_BINDINGS, logoSrc: brand?.logoUrl || undefined }}
              scale={scale}
              fontFamily={brand?.fontFamily || undefined}
              editable
              selectedId={selectedId}
              onSelect={setSelectedId}
              onElementChange={updateElement}
            />
          </div>
        </div>

        {/* right: properties */}
        <div className="w-64 shrink-0 border-l border-slate-800 p-3 space-y-3 overflow-y-auto">
          {!selected && (
            <p className="text-xs text-slate-500">
              Select an element on the canvas to edit its properties. Drag to move, use
              handles to resize/rotate.
            </p>
          )}
          {selected && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-slate-500">
                  {selected.kind}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => move(1)} title="Bring forward" className="rounded bg-slate-800 px-2 py-1 text-xs">↑</button>
                  <button onClick={() => move(-1)} title="Send backward" className="rounded bg-slate-800 px-2 py-1 text-xs">↓</button>
                  <button onClick={removeSelected} title="Delete" className="rounded bg-red-900/50 text-red-300 px-2 py-1 text-xs">✕</button>
                </div>
              </div>

              {selected.kind === "text" && (
                <TextProps el={selected as TextElement} onChange={updateElement} />
              )}
              {selected.kind === "rect" && (
                <div className="space-y-2">
                  <label className="block text-xs text-slate-400">
                    Fill
                    <input
                      type="text"
                      value={(selected as { fill: string }).fill}
                      onChange={(e) => updateElement({ ...selected, fill: e.target.value } as TemplateElement)}
                      className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs"
                    />
                  </label>
                  <label className="block text-xs text-slate-400">
                    Gradient to (empty = solid)
                    <input
                      type="text"
                      value={(selected as { gradientTo?: string }).gradientTo ?? ""}
                      onChange={(e) =>
                        updateElement({ ...selected, gradientTo: e.target.value || undefined } as TemplateElement)
                      }
                      className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs"
                    />
                  </label>
                </div>
              )}
              {selected.kind === "image" && (
                <p className="text-xs text-slate-500">
                  Background slot — the news image (or your upload) fills this area in the
                  composer with cover fit.
                </p>
              )}
              {selected.kind === "logo" && (
                <p className="text-xs text-slate-500">
                  Logo slot — filled by the brand&apos;s logo, contained inside these bounds.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TextProps({ el, onChange }: { el: TextElement; onChange: (e: TextElement) => void }) {
  return (
    <div className="space-y-2">
      <label className="block text-xs text-slate-400">
        Role (binds to article data)
        <select
          value={el.role}
          onChange={(e) => onChange({ ...el, role: e.target.value as TextElement["role"] })}
          className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs"
        >
          {["headline", "subtext", "source", "date", "static"].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-slate-400">
        Text {el.role !== "static" && "(placeholder)"}
        <textarea
          value={el.text}
          onChange={(e) => onChange({ ...el, text: e.target.value })}
          rows={2}
          className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-slate-400">
          Size
          <input
            type="number"
            value={el.fontSize}
            onChange={(e) => onChange({ ...el, fontSize: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs"
          />
        </label>
        <label className="block text-xs text-slate-400">
          Weight
          <select
            value={el.fontWeight}
            onChange={(e) => onChange({ ...el, fontWeight: e.target.value as "bold" | "normal" })}
            className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs"
          >
            <option value="bold">Bold</option>
            <option value="normal">Normal</option>
          </select>
        </label>
        <label className="block text-xs text-slate-400">
          Color
          <input
            type="color"
            value={el.fill}
            onChange={(e) => onChange({ ...el, fill: e.target.value })}
            className="mt-1 w-full h-8 rounded-lg bg-slate-800 border border-slate-700"
          />
        </label>
        <label className="block text-xs text-slate-400">
          Align
          <select
            value={el.align}
            onChange={(e) => onChange({ ...el, align: e.target.value as TextElement["align"] })}
            className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs"
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
      </div>
      <label className="block text-xs text-slate-400">
        Badge background (empty = plain text)
        <div className="mt-1 flex gap-2">
          <input
            type="text"
            value={el.bgColor ?? ""}
            placeholder="#dc2626"
            onChange={(e) => onChange({ ...el, bgColor: e.target.value || undefined })}
            className="flex-1 rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs"
          />
        </div>
      </label>
    </div>
  );
}
