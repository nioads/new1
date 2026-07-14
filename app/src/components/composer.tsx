"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type Konva from "konva";
import type { Aspect, ImageElement, MotionSettings, TemplateDto } from "@/lib/template-types";
import type { BrandDto, NewsItemDto } from "@/lib/types";
import { TemplateCanvas, type Bindings } from "@/components/canvas/template-canvas";

type RenderDto = {
  id: string;
  status: "QUEUED" | "PROCESSING" | "DONE" | "ERROR";
  aspect: string;
  outputUrl: string;
  error: string;
  createdAt: string;
};

const CANVAS_BOX = 620;

function proxied(src: string): string {
  if (src.startsWith("/") || src.startsWith("data:")) return src;
  return `/api/media/proxy?url=${encodeURIComponent(src)}`;
}

export function Composer({ itemId }: { itemId: string }) {
  const [item, setItem] = useState<NewsItemDto | null>(null);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [brands, setBrands] = useState<BrandDto[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [headline, setHeadline] = useState("");
  const [backgroundSrc, setBackgroundSrc] = useState("");
  const [bgAdjust, setBgAdjust] = useState({ zoom: 1, offsetX: 0, offsetY: 0 });
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [bgKind, setBgKind] = useState<"image" | "video">("image");
  const [motion, setMotion] = useState<MotionSettings>({
    duration: 5,
    kenburns: "in",
    textAnim: "slideup",
  });
  const [layer, setLayer] = useState<"all" | "bg" | "overlay">("all");
  const [videoBusy, setVideoBusy] = useState<string | null>(null);
  const [renders, setRenders] = useState<RenderDto[]>([]);
  const [music, setMusic] = useState<Array<{ id: string; name: string }>>([]);
  const [musicTrackId, setMusicTrackId] = useState("");
  const stageRef = useRef<Konva.Stage>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/items/${itemId}`)
      .then((r) => r.json())
      .then((it: NewsItemDto) => {
        setItem(it);
        setHeadline(it.title);
        const firstImage = it.media?.find((m) => m.type === "IMAGE");
        setBackgroundSrc(firstImage?.url ?? it.imageUrl ?? "");
      });
    fetch("/api/templates")
      .then((r) => r.json())
      .then((ts: TemplateDto[]) => {
        setTemplates(ts);
        if (ts.length > 0) {
          setTemplateId(ts[0].id);
          if (ts[0].brandId) setBrandId(ts[0].brandId);
        }
      });
    fetch("/api/brands").then((r) => r.json()).then(setBrands);
    fetch("/api/music").then((r) => r.json()).then(setMusic);
  }, [itemId]);

  const template = templates.find((t) => t.id === templateId) ?? null;
  const brand = brands.find((b) => b.id === brandId) ?? null;
  const baseVariant = template?.variants.find((v) => v.aspect === aspect) ?? null;

  // template motion defaults
  useEffect(() => {
    if (template?.motion) setMotion(template.motion);
  }, [template?.id, template?.motion]);

  // poll renders while any are pending
  const loadRenders = useCallback(() => {
    fetch(`/api/renders?item=${itemId}`).then((r) => r.json()).then(setRenders);
  }, [itemId]);
  useEffect(loadRenders, [loadRenders]);
  useEffect(() => {
    if (!renders.some((r) => r.status === "QUEUED" || r.status === "PROCESSING")) return;
    const t = setInterval(loadRenders, 3000);
    return () => clearInterval(t);
  }, [renders, loadRenders]);

  // Apply background pan/zoom on top of the template's background slot.
  const variant = useMemo(() => {
    if (!baseVariant) return null;
    return {
      ...baseVariant,
      elements: baseVariant.elements.map((el) =>
        el.kind === "image" && (el as ImageElement).role === "background"
          ? { ...el, zoom: bgAdjust.zoom, offsetX: bgAdjust.offsetX, offsetY: bgAdjust.offsetY }
          : el,
      ),
    };
  }, [baseVariant, bgAdjust]);

  const bindings: Bindings = useMemo(
    () => ({
      headline,
      subtext: item?.summary ?? "",
      source: item?.feed.title ?? "",
      date: item ? new Date(item.publishedAt).toLocaleDateString() : "",
      backgroundSrc: backgroundSrc || undefined,
      logoSrc: brand?.logoUrl || undefined,
    }),
    [headline, item, backgroundSrc, brand],
  );

  const images = item?.media?.filter((m) => m.type === "IMAGE") ?? [];
  const videos = item?.media?.filter((m) => m.type === "VIDEO") ?? [];
  const otherMedia = item?.media?.filter((m) => m.type === "AUDIO") ?? [];

  async function uploadImage(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    if (brandId) form.append("brandId", brandId);
    const res = await fetch("/api/uploads", { method: "POST", body: form });
    setUploading(false);
    if (res.ok) {
      const asset = await res.json();
      setBackgroundSrc(asset.url);
    }
  }

  async function snapshotLayer(which: "bg" | "overlay", scaleFactor: number): Promise<string> {
    setLayer(which);
    await new Promise((r) => setTimeout(r, 700));
    const stage = stageRef.current;
    if (!stage) throw new Error("canvas not ready");
    return stage.toDataURL({ pixelRatio: 1 / scaleFactor, mimeType: "image/png" });
  }

  async function exportVideo(targetAspect: Aspect) {
    if (!template) return;
    setVideoBusy(targetAspect);
    setAspect(targetAspect);
    await new Promise((r) => setTimeout(r, 900));
    const v = template.variants.find((x) => x.aspect === targetAspect);
    if (!v) return;
    const scaleFactor = Math.min(CANVAS_BOX / v.width, CANVAS_BOX / v.height);
    try {
      const overlayDataUrl = await snapshotLayer("overlay", scaleFactor);
      let backgroundDataUrl: string | undefined;
      let backgroundUrl: string | undefined;
      if (bgKind === "video") {
        backgroundUrl = backgroundSrc;
      } else {
        backgroundDataUrl = await snapshotLayer("bg", scaleFactor);
      }
      setLayer("all");
      const res = await fetch("/api/renders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          templateId: template.id,
          brandId: brandId || undefined,
          aspect: targetAspect,
          width: v.width,
          height: v.height,
          duration: motion.duration,
          backgroundKind: bgKind,
          backgroundDataUrl,
          backgroundUrl,
          overlayDataUrl,
          kenburns: motion.kenburns,
          textAnim: motion.textAnim,
          musicTrackId: musicTrackId || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "Render failed to queue");
      }
      loadRenders();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLayer("all");
      setVideoBusy(null);
    }
  }

  async function exportSize(targetAspect: Aspect) {
    if (!template) return;
    setExporting(targetAspect);
    setAspect(targetAspect);
    // wait for canvas to re-render and images to load
    await new Promise((r) => setTimeout(r, 900));
    const stage = stageRef.current;
    if (!stage) {
      setExporting(null);
      return;
    }
    const v = template.variants.find((x) => x.aspect === targetAspect);
    const scale = v ? Math.min(CANVAS_BOX / v.width, CANVAS_BOX / v.height) : 1;
    try {
      const dataUrl = stage.toDataURL({ pixelRatio: 1 / scale, mimeType: "image/png" });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `post-${targetAspect.replace(":", "x")}-${Date.now()}.png`;
      a.click();
    } catch {
      alert(
        "Export failed — an image on the canvas blocked cross-origin export. Try re-selecting the image.",
      );
    }
    setExporting(null);
  }

  if (!item) return <div className="p-10 text-slate-500 text-sm">Loading article…</div>;

  if (templates.length === 0) {
    return (
      <div className="p-10 text-center space-y-3">
        <p className="text-slate-400 text-sm">No templates yet.</p>
        <Link href="/templates" className="text-indigo-400 text-sm hover:underline">
          Create your first template →
        </Link>
      </div>
    );
  }

  const scale = variant ? Math.min(CANVAS_BOX / variant.width, CANVAS_BOX / variant.height) : 1;

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
        <Link href="/" className="text-slate-400 hover:text-white text-sm">
          ← Inbox
        </Link>
        <p className="text-sm font-medium text-white truncate flex-1" dir="auto">
          {item.title}
        </p>
        <select
          value={templateId}
          onChange={(e) => {
            setTemplateId(e.target.value);
            const t = templates.find((x) => x.id === e.target.value);
            if (t?.brandId) setBrandId(t.brandId);
          }}
          className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-sm max-w-44"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
          className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-sm"
        >
          <option value="">No brand</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* left: content + media */}
        <div className="w-72 shrink-0 border-r border-slate-800 p-3 space-y-4 overflow-y-auto">
          <label className="block text-xs text-slate-400">
            Headline
            <textarea
              dir="auto"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-sm"
            />
          </label>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">Article media ({images.length})</p>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "+ Upload"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadImage(f);
                  e.target.value = "";
                }}
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {images.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setBackgroundSrc(m.url);
                    setBgKind("image");
                    setBgAdjust({ zoom: 1, offsetX: 0, offsetY: 0 });
                  }}
                  className={`aspect-square rounded-lg overflow-hidden border-2 ${
                    backgroundSrc === m.url ? "border-indigo-500" : "border-transparent"
                  }`}
                  title={m.source}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={proxied(m.url)} alt="" className="w-full h-full object-cover bg-slate-800" />
                </button>
              ))}
              {images.length === 0 && (
                <p className="col-span-3 text-xs text-slate-600">
                  No images in this article — upload one.
                </p>
              )}
            </div>
            {videos.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-slate-400 mb-1">Article videos ({videos.length})</p>
                <div className="space-y-1">
                  {videos.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setBackgroundSrc(m.url);
                        setBgKind("video");
                      }}
                      className={`w-full text-left rounded-lg px-2 py-1.5 text-xs truncate border ${
                        backgroundSrc === m.url && bgKind === "video"
                          ? "border-indigo-500 text-indigo-300"
                          : "border-slate-800 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      🎬 {m.url.split("/").pop()}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-slate-600">
                  Video backgrounds apply to video exports (loops, cover-cropped).
                </p>
              </div>
            )}
            {otherMedia.length > 0 && (
              <p className="mt-2 text-[11px] text-slate-500">
                +{otherMedia.length} audio file(s) captured — used in video phases.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs text-slate-400">Image position</p>
            <label className="block text-[11px] text-slate-500">
              Zoom
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={bgAdjust.zoom}
                onChange={(e) => setBgAdjust({ ...bgAdjust, zoom: Number(e.target.value) })}
                className="w-full accent-indigo-500"
              />
            </label>
            <label className="block text-[11px] text-slate-500">
              Horizontal
              <input
                type="range"
                min={-1}
                max={1}
                step={0.02}
                value={bgAdjust.offsetX}
                onChange={(e) => setBgAdjust({ ...bgAdjust, offsetX: Number(e.target.value) })}
                className="w-full accent-indigo-500"
              />
            </label>
            <label className="block text-[11px] text-slate-500">
              Vertical
              <input
                type="range"
                min={-1}
                max={1}
                step={0.02}
                value={bgAdjust.offsetY}
                onChange={(e) => setBgAdjust({ ...bgAdjust, offsetY: Number(e.target.value) })}
                className="w-full accent-indigo-500"
              />
            </label>
          </div>
        </div>

        {/* center: canvas */}
        <div className="flex-1 min-w-0 flex flex-col items-center overflow-auto p-4 gap-3">
          <div className="flex gap-1 rounded-lg bg-slate-900 border border-slate-800 p-1">
            {template?.variants.map((v) => (
              <button
                key={v.aspect}
                onClick={() => setAspect(v.aspect)}
                className={`rounded-md px-3 py-1 text-xs font-medium ${
                  aspect === v.aspect ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {v.aspect}
              </button>
            ))}
          </div>
          {variant && (
            <div className="rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
              <TemplateCanvas
                ref={stageRef}
                variant={variant}
                bindings={bindings}
                scale={scale}
                fontFamily={brand?.fontFamily || undefined}
                layer={layer}
              />
            </div>
          )}
        </div>

        {/* right: export */}
        <div className="w-64 shrink-0 border-l border-slate-800 p-3 space-y-2 overflow-y-auto">
          <p className="text-xs text-slate-400">Export PNG</p>
          {template?.variants.map((v) => (
            <button
              key={v.aspect}
              onClick={() => exportSize(v.aspect)}
              disabled={exporting !== null || bgKind === "video"}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-2 text-sm font-medium"
            >
              {exporting === v.aspect ? "Exporting…" : `⬇ ${v.aspect} (${v.width}×${v.height})`}
            </button>
          ))}

          <div className="pt-3 border-t border-slate-800 space-y-2">
            <p className="text-xs text-slate-400">Video post (≤5s)</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[11px] text-slate-500">
                Duration
                <select
                  value={motion.duration}
                  onChange={(e) => setMotion({ ...motion, duration: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs"
                >
                  {[3, 4, 5].map((d) => (
                    <option key={d} value={d}>
                      {d}s
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] text-slate-500">
                Motion
                <select
                  value={motion.kenburns}
                  onChange={(e) =>
                    setMotion({ ...motion, kenburns: e.target.value as MotionSettings["kenburns"] })
                  }
                  className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs"
                >
                  <option value="in">Zoom in</option>
                  <option value="out">Zoom out</option>
                  <option value="left">Pan left</option>
                  <option value="right">Pan right</option>
                  <option value="none">Still</option>
                </select>
              </label>
              <label className="col-span-2 block text-[11px] text-slate-500">
                Music
                <select
                  value={musicTrackId}
                  onChange={(e) => setMusicTrackId(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs"
                >
                  <option value="">No music</option>
                  {music.map((t) => (
                    <option key={t.id} value={t.id}>
                      ♫ {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 block text-[11px] text-slate-500">
                Text animation
                <select
                  value={motion.textAnim}
                  onChange={(e) =>
                    setMotion({ ...motion, textAnim: e.target.value as MotionSettings["textAnim"] })
                  }
                  className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs"
                >
                  <option value="slideup">Slide up + fade</option>
                  <option value="fade">Fade in</option>
                  <option value="none">None</option>
                </select>
              </label>
            </div>
            {template?.variants.map((v) => (
              <button
                key={v.aspect}
                onClick={() => exportVideo(v.aspect)}
                disabled={videoBusy !== null}
                className="w-full rounded-lg bg-fuchsia-700 hover:bg-fuchsia-600 disabled:opacity-50 px-3 py-2 text-sm font-medium"
              >
                {videoBusy === v.aspect ? "Preparing…" : `🎬 ${v.aspect} video`}
              </button>
            ))}
          </div>

          {renders.length > 0 && (
            <div className="pt-3 border-t border-slate-800 space-y-1.5">
              <p className="text-xs text-slate-400">Renders</p>
              {renders.map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-2 text-xs flex items-center gap-2"
                >
                  <span className="text-slate-400">{r.aspect}</span>
                  {r.status === "DONE" ? (
                    <a
                      href={r.outputUrl}
                      download
                      className="ml-auto text-emerald-400 hover:text-emerald-300"
                    >
                      ⬇ MP4
                    </a>
                  ) : r.status === "ERROR" ? (
                    <span
                      className="ml-auto text-red-400 truncate max-w-40 cursor-help"
                      title={r.error}
                      onClick={() => alert(r.error || "Unknown render error")}
                    >
                      failed: {r.error?.slice(0, 40) || "unknown"}
                    </span>
                  ) : (
                    <span className="ml-auto text-amber-400 animate-pulse">
                      {r.status.toLowerCase()}…
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
