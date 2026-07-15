// Article→Video assembly: renders each scene (visual + Ken Burns + narration)
// to a uniform segment, then concatenates segments with per-scene fade
// transitions and an optional looping music bed. Scene-chunked so long
// videos stay tractable.
import { spawn } from "child_process";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import type { PrismaClient, Scene } from "../generated/prisma/client";
import { mediaDir, storeFile } from "./storage";
import { resolveToLocalFile, resolveOptionalLocalFile } from "./media-path";
import { generateImage, ffprobeDuration } from "./ai";
import { getSettings } from "./settings";
import {
  buildAss,
  estimateWords,
  BUILTIN_CAPTION_STYLES,
  type CaptionStyleSpec,
  type CaptionWord,
  type SceneCaption,
} from "./captions";

const FFMPEG = () => process.env.FFMPEG_PATH ?? "ffmpeg";
const FPS = 25;
const SEGMENT_TIMEOUT_MS = 5 * 60 * 1000;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp)(\?|#|$)/i;

function run(args: string[], timeoutMs = SEGMENT_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG(), args);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr = (stderr + d).slice(-3000)));
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("ffmpeg timed out"));
    }, timeoutMs);
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-700)}`));
    });
  });
}

const PAD_COLOR = "0x0f172a";
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// Builds the video filter graph ([0:v] → [vv]) for one scene's IMAGE visual,
// honoring the framing mode so a source of any aspect looks good at WxH:
//  - cover:   fill and crop around the focal point, with Ken Burns motion
//  - blur:    fit the whole image over a blurred, darkened fill of itself
//             (best for portrait output from landscape sources — no crop)
//  - contain: letterbox the whole image on a solid pad
function buildImageGraph(scene: Scene, w: number, h: number, frames: number, fadeF: string): string {
  const fx = clamp01(scene.focusX ?? 0.5);
  const fy = clamp01(scene.focusY ?? 0.5);
  const sz = Math.max(1, scene.zoom || 1);

  if (scene.fit === "contain") {
    return `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=${PAD_COLOR},fps=${FPS},setsar=1${fadeF}[vv]`;
  }
  if (scene.fit === "blur") {
    return (
      `[0:v]split=2[bg][fg];` +
      `[bg]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=40:1,eq=brightness=-0.08[bgb];` +
      `[fg]scale=${w}:${h}:force_original_aspect_ratio=decrease[fgs];` +
      `[bgb][fgs]overlay=(W-w)/2:(H-h)/2,fps=${FPS},setsar=1${fadeF}[vv]`
    );
  }

  // cover + focal crop (at K× headroom so Ken Burns can pan/zoom without edges)
  const K = 1.25;
  const cw = Math.round(w * K);
  const ch = Math.round(h * K);
  const cover = `scale=${cw}:${ch}:force_original_aspect_ratio=increase,crop=${cw}:${ch}:x='(iw-ow)*${fx.toFixed(3)}':y='(ih-oh)*${fy.toFixed(3)}'`;
  const centered = `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
  const amt = 0.14;
  let z: string;
  let xy = centered;
  switch (scene.kenburns) {
    case "out":
      z = `${(sz + amt).toFixed(3)}-${amt}*on/${frames}`;
      break;
    case "left":
      z = `${Math.max(sz, 1.08).toFixed(3)}`;
      xy = `x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)'`;
      break;
    case "right":
      z = `${Math.max(sz, 1.08).toFixed(3)}`;
      xy = `x='(iw-iw/zoom)*on/${frames}':y='ih/2-(ih/zoom/2)'`;
      break;
    case "none":
      z = sz.toFixed(3);
      break;
    default: // in
      z = `${sz.toFixed(3)}+${amt}*on/${frames}`;
  }
  return `[0:v]${cover},zoompan=z='${z}':${xy}:d=${frames}:s=${w}x${h}:fps=${FPS},setsar=1${fadeF}[vv]`;
}

// Same framing modes for a VIDEO visual (no Ken Burns — the clip has motion).
function buildVideoGraph(scene: Scene, w: number, h: number, fadeF: string): string {
  const fx = clamp01(scene.focusX ?? 0.5);
  const fy = clamp01(scene.focusY ?? 0.5);
  if (scene.fit === "contain") {
    return `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=${PAD_COLOR},fps=${FPS},setsar=1${fadeF}[vv]`;
  }
  if (scene.fit === "blur") {
    return (
      `[0:v]split=2[bg][fg];` +
      `[bg]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=40:1,eq=brightness=-0.08[bgb];` +
      `[fg]scale=${w}:${h}:force_original_aspect_ratio=decrease[fgs];` +
      `[bgb][fgs]overlay=(W-w)/2:(H-h)/2,fps=${FPS},setsar=1${fadeF}[vv]`
    );
  }
  return `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}:x='(iw-ow)*${fx.toFixed(3)}':y='(ih-oh)*${fy.toFixed(3)}',fps=${FPS},setsar=1${fadeF}[vv]`;
}

async function renderSceneSegment(opts: {
  scene: Scene;
  imagePath: string | null; // null → plain dark slate
  ttsPath: string | null;
  width: number;
  height: number;
  outPath: string;
  isVideoVisual: boolean;
}): Promise<number> {
  const { scene, width, height } = opts;
  const duration = Math.max(1.5, scene.ttsDuration > 0 ? scene.ttsDuration + 0.6 : scene.durationSec);
  const fade = scene.transition !== "cut";
  const fadeF = fade
    ? `,fade=t=in:st=0:d=0.25,fade=t=out:st=${(duration - 0.25).toFixed(2)}:d=0.25`
    : "";

  const frames = Math.max(1, Math.round(duration * FPS));
  const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];
  let videoGraph: string;
  if (!opts.imagePath) {
    args.push("-f", "lavfi", "-i", `color=c=${PAD_COLOR}:s=${width}x${height}:d=${duration}`);
    videoGraph = `[0:v]fps=${FPS},setsar=1${fadeF}[vv]`;
  } else if (opts.isVideoVisual) {
    args.push("-stream_loop", "-1", "-i", opts.imagePath);
    videoGraph = buildVideoGraph(scene, width, height, fadeF);
  } else {
    args.push("-i", opts.imagePath);
    videoGraph = buildImageGraph(scene, width, height, frames, fadeF);
  }
  if (opts.ttsPath) {
    args.push("-i", opts.ttsPath);
  } else {
    args.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo");
  }
  args.push(
    "-filter_complex",
    `${videoGraph};[1:a]apad,aresample=44100[a]`,
    "-map", "[vv]", "-map", "[a]",
    "-t", duration.toFixed(2),
    "-r", String(FPS),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-ar", "44100", "-ac", "2",
    opts.outPath,
  );
  await run(args);
  return duration;
}

// Normalizes a brand intro/outro clip to the project's size/codec so it can
// be concatenated with scene segments.
async function normalizeClip(
  srcPath: string,
  width: number,
  height: number,
  outPath: string,
): Promise<number> {
  const probe = await new Promise<string>((resolve) => {
    const p = spawn(process.env.FFPROBE_PATH ?? "ffprobe", [
      "-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", srcPath,
    ]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => resolve(out.trim()));
    p.on("error", () => resolve(""));
  });
  const hasAudio = probe.includes("audio");
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-i", srcPath];
  if (!hasAudio) args.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo");
  args.push(
    "-filter_complex",
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${FPS},setsar=1[v];[${hasAudio ? "0:a" : "1:a"}]aresample=44100[a]`,
    "-map", "[v]", "-map", "[a]",
    ...(hasAudio ? [] : ["-shortest"]),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-ar", "44100", "-ac", "2",
    outPath,
  );
  await run(args);
  return ffprobeDuration(outPath);
}

export async function processNextProject(prisma: PrismaClient): Promise<boolean> {
  const job = await prisma.videoProject.findFirst({
    where: { status: "QUEUED" },
    orderBy: { updatedAt: "asc" },
  });
  if (!job) return false;
  const claimed = await prisma.videoProject.updateMany({
    where: { id: job.id, status: "QUEUED" },
    data: { status: "RENDERING" },
  });
  if (claimed.count === 0) return false;

  const workDir = path.join(mediaDir(), "project-tmp", job.id);
  const cleanup: string[] = [workDir];

  try {
    const settings = await getSettings(prisma);
    const scenes = await prisma.scene.findMany({
      where: { projectId: job.id },
      orderBy: { order: "asc" },
    });
    if (scenes.length === 0) throw new Error("Project has no scenes");
    await mkdir(workDir, { recursive: true });

    const brand = job.brandId
      ? await prisma.brand.findUnique({ where: { id: job.brandId } })
      : null;

    // 0. brand intro (prepended before scenes)
    const segments: string[] = [];
    let total = 0;
    let captionOffset = 0;
    if (brand?.introUrl) {
      const src = await resolveOptionalLocalFile(brand.introUrl, `project-tmp/${job.id}`);
      if (src) {
        const introPath = path.join(workDir, "intro.mp4");
        const d = await normalizeClip(src.path, job.width, job.height, introPath);
        segments.push(introPath);
        total += d;
        captionOffset = d;
      }
    }

    // 1. render each scene to a uniform segment
    const sceneCaptions: SceneCaption[] = [];
    for (const [i, scene] of scenes.entries()) {
      let imagePath: string | null = null;
      let isVideoVisual = false;
      const resolvedVisual = scene.imageUrl
        ? await resolveOptionalLocalFile(scene.imageUrl, `project-tmp/${job.id}`)
        : null;
      if (resolvedVisual) {
        imagePath = resolvedVisual.path;
        isVideoVisual =
          !IMAGE_EXT.test(scene.imageUrl) && /\.(mp4|m4v|mov|webm|m3u8)(\?|#|$)/i.test(scene.imageUrl);
      } else {
        // no visual (or the referenced file is missing) — generate a mock-safe
        // placeholder from the scene prompt/query so the render still completes
        const buffer = await generateImage(
          settings,
          scene.imagePrompt || scene.imageQuery || scene.text.slice(0, 120),
          job.width,
          job.height,
        );
        imagePath = path.join(workDir, `gen-${i}.png`);
        const { writeFile } = await import("fs/promises");
        await writeFile(imagePath, buffer);
      }
      let ttsPath: string | null = null;
      if (scene.ttsUrl) {
        ttsPath = (await resolveOptionalLocalFile(scene.ttsUrl, `project-tmp/${job.id}`))?.path ?? null;
      }
      const segPath = path.join(workDir, `seg-${String(i).padStart(3, "0")}.mp4`);
      const segDuration = await renderSceneSegment({
        scene,
        imagePath,
        ttsPath,
        width: job.width,
        height: job.height,
        outPath: segPath,
        isVideoVisual,
      });
      // caption timings: scene audio starts at the segment start
      if (scene.text.trim()) {
        const words =
          (scene.words as CaptionWord[] | null) ??
          estimateWords(scene.text, Math.max(1, segDuration - 0.6));
        sceneCaptions.push({ offset: captionOffset, words });
      }
      captionOffset += segDuration;
      total += segDuration;
      segments.push(segPath);
      console.log(`[project] ${job.id} scene ${i + 1}/${scenes.length} rendered`);
    }

    // 1b. brand outro (appended after scenes)
    if (brand?.outroUrl) {
      const src = await resolveOptionalLocalFile(brand.outroUrl, `project-tmp/${job.id}`);
      if (src) {
        const outroPath = path.join(workDir, "outro.mp4");
        total += await normalizeClip(src.path, job.width, job.height, outroPath);
        segments.push(outroPath);
      }
    }

    // 2. concatenate + optional music bed
    const outPath = path.join(workDir, "final.mp4");
    const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];
    for (const seg of segments) args.push("-i", seg);

    let musicPath: string | null = null;
    if (job.musicTrackId) {
      const track = await prisma.musicTrack.findUnique({ where: { id: job.musicTrackId } });
      if (track) {
        musicPath = (await resolveOptionalLocalFile(track.url, `project-tmp/${job.id}`))?.path ?? null;
      }
    }
    if (musicPath) args.push("-stream_loop", "-1", "-i", musicPath);

    let extraInputs = musicPath ? 1 : 0;

    // brand logo watermark
    let logoPath: string | null = null;
    if (brand?.logoUrl) {
      logoPath = (await resolveOptionalLocalFile(brand.logoUrl, `project-tmp/${job.id}`))?.path ?? null;
      if (logoPath) {
        args.push("-i", logoPath);
        extraInputs++;
      }
    }

    // burned-in captions (per-project toggle + selectable style)
    let assPath: string | null = null;
    if (job.captionsEnabled && sceneCaptions.length > 0) {
      let spec: CaptionStyleSpec = BUILTIN_CAPTION_STYLES[0].style;
      if (job.captionStyleId) {
        const style = await prisma.captionStyle.findUnique({ where: { id: job.captionStyleId } });
        if (style) spec = style.style as unknown as CaptionStyleSpec;
      }
      assPath = path.join(workDir, "captions.ass");
      await writeFile(assPath, buildAss(sceneCaptions, spec, job.width, job.height));
    }

    const pairs = segments.map((_, i) => `[${i}:v][${i}:a]`).join("");
    let filter = `${pairs}concat=n=${segments.length}:v=1:a=1[cv][na]`;
    let vLabel = "cv";
    if (logoPath) {
      const logoIdx = segments.length + (musicPath ? 1 : 0);
      const logoW = Math.round(job.width * 0.12);
      filter += `;[${logoIdx}:v]scale=${logoW}:-1[lg];[${vLabel}][lg]overlay=W-w-${Math.round(job.width * 0.03)}:${Math.round(job.width * 0.03)}[lv]`;
      vLabel = "lv";
    }
    if (assPath) {
      const escaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
      filter += `;[${vLabel}]subtitles='${escaped}'[sv]`;
      vLabel = "sv";
    }
    filter += `;[${vLabel}]null[v]`;
    void extraInputs;
    if (musicPath) {
      const fadeStart = Math.max(0, total - 2).toFixed(2);
      filter += `;[${segments.length}:a]volume=0.22[mq];[na][mq]amix=inputs=2:duration=first:dropout_transition=0,afade=t=out:st=${fadeStart}:d=2[a]`;
    } else {
      filter += `;[na]anull[a]`;
    }
    args.push(
      "-filter_complex", filter,
      "-map", "[v]", "-map", "[a]",
      "-t", total.toFixed(2),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-ar", "44100", "-ac", "2",
      "-movflags", "+faststart",
      outPath,
    );
    await run(args, 20 * 60 * 1000);

    const buffer = await readFile(outPath);
    const stored = await storeFile(brand, buffer, `project-${job.id}.mp4`, "video/mp4");
    await prisma.mediaAsset.create({
      data: {
        brandId: job.brandId,
        kind: "render",
        url: stored.url,
        storageKey: stored.storageKey,
        mimeType: "video/mp4",
      },
    });
    await prisma.videoProject.update({
      where: { id: job.id },
      data: { status: "DONE", outputUrl: stored.url, error: "" },
    });
    console.log(`[project] ${job.id} done → ${stored.url} (${total.toFixed(1)}s)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[project] ${job.id} failed: ${message}`);
    await prisma.videoProject.update({
      where: { id: job.id },
      data: { status: "ERROR", error: message.slice(0, 1000) },
    });
  } finally {
    for (const f of cleanup) await rm(f, { recursive: true, force: true }).catch(() => {});
  }
  return true;
}
