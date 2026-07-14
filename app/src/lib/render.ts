import { spawn } from "child_process";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import type { PrismaClient } from "../generated/prisma/client";
import { mediaDir, storeFile } from "./storage";

export type KenBurns = "in" | "out" | "left" | "right" | "none";
export type TextAnim = "fade" | "slideup" | "none";

export type RenderParams = {
  width: number;
  height: number;
  duration: number; // seconds, ≤ 5 for Phase 3 posts
  fps: number;
  background: { kind: "image" | "video"; path?: string; url?: string };
  overlayPath: string;
  kenburns: KenBurns;
  textAnim: TextAnim;
  music?: { url?: string; path?: string };
};

const FFMPEG = () => process.env.FFMPEG_PATH ?? "ffmpeg";
const RENDER_TIMEOUT_MS = 4 * 60 * 1000;

export function renderTmpDir(): string {
  return path.join(mediaDir(), "render-tmp");
}

export async function writeDataUrl(dataUrl: string, filePath: string): Promise<void> {
  const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) throw new Error("Invalid data URL");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(match[2], "base64"));
}

function kenburnsFilter(p: RenderParams): string {
  const frames = Math.round(p.duration * p.fps);
  const zoomAmount = 0.16;
  // Pre-scale up so zoompan has pixel headroom (avoids jitter), then animate.
  const pre = `scale=${p.width * 2}:-2`;
  const centered = `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
  let zp: string;
  switch (p.kenburns) {
    case "in":
      zp = `zoompan=z='1+${zoomAmount}*on/${frames}':${centered}`;
      break;
    case "out":
      zp = `zoompan=z='${1 + zoomAmount}-${zoomAmount}*on/${frames}':${centered}`;
      break;
    case "left":
      zp = `zoompan=z='1.12':x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)'`;
      break;
    case "right":
      zp = `zoompan=z='1.12':x='(iw-iw/zoom)*on/${frames}':y='ih/2-(ih/zoom/2)'`;
      break;
    default:
      zp = `zoompan=z='1':${centered}`;
  }
  return `${pre},${zp}:d=${frames}:s=${p.width}x${p.height}:fps=${p.fps},setsar=1`;
}

function overlayAnim(p: RenderParams): { filter: string; overlay: string } {
  const fadeIn = `format=rgba,fade=t=in:st=0.15:d=0.5:alpha=1`;
  switch (p.textAnim) {
    case "slideup":
      return {
        filter: fadeIn,
        overlay: `overlay=x=0:y='${Math.round(p.height * 0.05)}*(1-min(t/0.55,1))':shortest=1`,
      };
    case "fade":
      return { filter: fadeIn, overlay: `overlay=0:0:shortest=1` };
    default:
      return { filter: `format=rgba`, overlay: `overlay=0:0:shortest=1` };
  }
}

export function buildFfmpegArgs(p: RenderParams, outPath: string): string[] {
  const anim = overlayAnim(p);
  const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];

  if (p.background.kind === "video") {
    args.push("-stream_loop", "-1", "-i", p.background.path!);
  } else {
    args.push("-i", p.background.path!);
  }
  args.push("-loop", "1", "-i", p.overlayPath);

  const bgFilter =
    p.background.kind === "video"
      ? `scale=${p.width}:${p.height}:force_original_aspect_ratio=increase,crop=${p.width}:${p.height},fps=${p.fps},setsar=1`
      : kenburnsFilter(p);

  let filter = `[0:v]${bgFilter}[bg];[1:v]${anim.filter}[ov];[bg][ov]${anim.overlay}[out]`;
  const maps: string[] = ["-map", "[out]"];
  if (p.music?.path) {
    args.push("-stream_loop", "-1", "-i", p.music.path);
    const fadeStart = Math.max(0, p.duration - 1).toFixed(2);
    filter += `;[2:a]volume=0.35,afade=t=out:st=${fadeStart}:d=1[aout]`;
    maps.push("-map", "[aout]");
  }

  args.push("-filter_complex", filter, ...maps, "-t", String(p.duration), "-r", String(p.fps));
  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p");
  if (p.music?.path) args.push("-c:a", "aac", "-ar", "44100", "-ac", "2");
  else args.push("-an");
  args.push("-movflags", "+faststart", outPath);
  return args;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG(), args);
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr = (stderr + d.toString()).slice(-3000);
    });
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("ffmpeg timed out"));
    }, RENDER_TIMEOUT_MS);
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}

async function downloadTo(url: string, filePath: string): Promise<void> {
  const res = await fetch(url, {
    headers: { "user-agent": "NewsStudio/1.0 (+renderer)" },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Background download failed: HTTP ${res.status}`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(await res.arrayBuffer()));
}

// Claims and processes the oldest queued render. Returns false when idle.
export async function processNextRender(prisma: PrismaClient): Promise<boolean> {
  const job = await prisma.videoRender.findFirst({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return false;
  const claimed = await prisma.videoRender.updateMany({
    where: { id: job.id, status: "QUEUED" },
    data: { status: "PROCESSING" },
  });
  if (claimed.count === 0) return false;

  const params = job.params as unknown as RenderParams;
  const outPath = path.join(renderTmpDir(), `${job.id}.mp4`);
  const cleanup: string[] = [outPath];

  try {
    if (params.background.kind === "video" && params.background.url && !params.background.path) {
      const bgPath = path.join(renderTmpDir(), `${job.id}-bg.mp4`);
      await downloadTo(params.background.url, bgPath);
      params.background.path = bgPath;
      cleanup.push(bgPath);
    }
    if (!params.background.path) throw new Error("No background available");
    if (params.background.path) cleanup.push(params.background.path);
    cleanup.push(params.overlayPath);

    if (params.music?.url && !params.music.path) {
      const { resolveToLocalFile } = await import("./media-path");
      const resolved = await resolveToLocalFile(params.music.url);
      params.music.path = resolved.path;
      if (resolved.temp) cleanup.push(resolved.path);
    }

    await mkdir(renderTmpDir(), { recursive: true });
    await runFfmpeg(buildFfmpegArgs(params, outPath));

    const buffer = await readFile(outPath);
    const brand = job.brandId
      ? await prisma.brand.findUnique({ where: { id: job.brandId } })
      : null;
    const stored = await storeFile(brand, buffer, `${job.id}.mp4`, "video/mp4");
    await prisma.mediaAsset.create({
      data: {
        brandId: job.brandId,
        kind: "render",
        url: stored.url,
        storageKey: stored.storageKey,
        mimeType: "video/mp4",
      },
    });
    await prisma.videoRender.update({
      where: { id: job.id },
      data: { status: "DONE", outputUrl: stored.url, error: "" },
    });
    console.log(`[render] ${job.id} done → ${stored.url}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[render] ${job.id} failed: ${message}`);
    await prisma.videoRender.update({
      where: { id: job.id },
      data: { status: "ERROR", error: message.slice(0, 1000) },
    });
  } finally {
    for (const f of cleanup) await rm(f, { force: true }).catch(() => {});
  }
  return true;
}
