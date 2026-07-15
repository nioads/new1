// Article→Video assembly: renders each scene (visual + Ken Burns + narration)
// to a uniform segment, then concatenates segments with per-scene fade
// transitions and an optional looping music bed. Scene-chunked so long
// videos stay tractable.
import { spawn } from "child_process";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import type { PrismaClient, Scene } from "../generated/prisma/client";
import { mediaDir, storeFile } from "./storage";
import { resolveOptionalLocalFile } from "./media-path";
import { generateImage, ffprobeDuration } from "./ai";
import { getSettings } from "./settings";
import {
  buildAss,
  buildCaptionDocument,
  buildSrt,
  buildVtt,
  estimateWords,
  BUILTIN_CAPTION_STYLES,
  type CaptionDocument,
  type CaptionGroup,
  type CaptionStyleSpec,
  type CaptionWord,
  type SceneCaptionInput,
} from "./captions";
import { renderCaptionOverlay } from "./remotion";

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
    const sceneCaptions: SceneCaptionInput[] = [];
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
      // caption timings: scene audio starts at the segment start. Use the
      // scene's edited caption groups when present (source of truth); otherwise
      // fall back to word timings (Whisper/estimated) grouped at render time.
      if (scene.text.trim()) {
        const words =
          (scene.words as CaptionWord[] | null) ??
          estimateWords(scene.text, Math.max(1, segDuration - 0.6));
        const groups = (scene.captionGroups as CaptionGroup[] | null) ?? undefined;
        sceneCaptions.push({
          sceneId: scene.id,
          offsetSec: captionOffset,
          words,
          groups: groups && groups.length ? groups : undefined,
        });
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

    // 2. Concatenate segments with the concat demuxer. All segments share the
    //    exact same codec/params (normalizeClip + renderSceneSegment), so this
    //    is a robust stream-copy — no fragile N-input filtergraph index math.
    const outPath = path.join(workDir, "final.mp4");
    const concatMp4 = path.join(workDir, "concat.mp4");
    const listPath = path.join(workDir, "segments.txt");
    await writeFile(
      listPath,
      segments.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join("\n"),
    );
    await run([
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "concat", "-safe", "0", "-i", listPath,
      "-c", "copy", concatMp4,
    ]);

    // resolve optional overlays / bed
    let musicPath: string | null = null;
    if (job.musicTrackId) {
      const track = await prisma.musicTrack.findUnique({ where: { id: job.musicTrackId } });
      if (track) {
        musicPath = (await resolveOptionalLocalFile(track.url, `project-tmp/${job.id}`))?.path ?? null;
      }
    }
    let logoPath: string | null = null;
    if (brand?.logoUrl) {
      logoPath = (await resolveOptionalLocalFile(brand.logoUrl, `project-tmp/${job.id}`))?.path ?? null;
    }
    // Build the Canonical Caption JSON once — the single source of truth that
    // feeds every caption renderer and the SRT/VTT sidecars.
    let assPath: string | null = null;
    let overlayPath: string | null = null;
    let captionDoc: CaptionDocument | null = null;
    if (job.captionsEnabled && sceneCaptions.length > 0) {
      let spec: CaptionStyleSpec = BUILTIN_CAPTION_STYLES[0].style;
      if (job.captionStyleId) {
        const style = await prisma.captionStyle.findUnique({ where: { id: job.captionStyleId } });
        if (style) spec = style.style as unknown as CaptionStyleSpec;
      }
      captionDoc = buildCaptionDocument(sceneCaptions, spec, job.width, job.height, FPS);

      const renderer = (job.captionRenderer || settings.CAPTION_RENDERER || "remotion").toLowerCase();
      if (renderer === "remotion") {
        // Premium path: render an alpha overlay with Remotion. On any failure
        // (missing browser, bundle error) fall through to libass automatically.
        overlayPath = path.join(workDir, "captions.webm");
        const ok = await renderCaptionOverlay(captionDoc, overlayPath);
        if (!ok) overlayPath = null;
      }
      if (!overlayPath) {
        assPath = path.join(workDir, "captions.ass");
        await writeFile(assPath, buildAss(captionDoc));
      }
    }

    // 2b. Second pass over the concatenated video: logo watermark + burned
    //     captions (video) and music bed (audio). Input 0 is always the concat;
    //     music/logo get the next indices only when present.
    const needVideoFx = !!logoPath || !!assPath || !!overlayPath;
    const needAudioFx = !!musicPath;
    if (!needVideoFx && !needAudioFx) {
      await rm(outPath, { force: true }).catch(() => {});
      const { rename } = await import("fs/promises");
      await rename(concatMp4, outPath);
    } else {
      const args: string[] = ["-y", "-hide_banner", "-loglevel", "error", "-i", concatMp4];
      let idx = 1;
      let musicIdx = -1;
      let logoIdx = -1;
      let capIdx = -1;
      if (musicPath) {
        args.push("-stream_loop", "-1", "-i", musicPath);
        musicIdx = idx++;
      }
      if (logoPath) {
        args.push("-i", logoPath);
        logoIdx = idx++;
      }
      if (overlayPath) {
        args.push("-i", overlayPath);
        capIdx = idx++;
      }
      const fc: string[] = [];
      let vOut = "0:v";
      if (needVideoFx) {
        let v = "[0:v]";
        if (logoIdx >= 0) {
          const logoW = Math.round(job.width * 0.12);
          const m = Math.round(job.width * 0.03);
          fc.push(`[${logoIdx}:v]scale=${logoW}:-1[lg]`);
          fc.push(`${v}[lg]overlay=W-w-${m}:${m}[lv]`);
          v = "[lv]";
        }
        if (capIdx >= 0) {
          // Composite the Remotion alpha caption overlay (may be shorter than
          // the video — hold nothing after it ends).
          fc.push(`[${capIdx}:v]scale=${job.width}:${job.height},setsar=1[cap]`);
          fc.push(`${v}[cap]overlay=0:0:eof_action=pass[cv]`);
          v = "[cv]";
        }
        if (assPath) {
          const escaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
          fc.push(`${v}subtitles='${escaped}'[sv]`);
          v = "[sv]";
        }
        vOut = v.replace(/[[\]]/g, "");
      }
      let aOut = "0:a";
      if (needAudioFx) {
        const fadeStart = Math.max(0, total - 2).toFixed(2);
        fc.push(`[${musicIdx}:a]volume=0.22[mq]`);
        fc.push(
          `[0:a][mq]amix=inputs=2:duration=first:dropout_transition=0,afade=t=out:st=${fadeStart}:d=2[amx]`,
        );
        aOut = "amx";
      }
      args.push("-filter_complex", fc.join(";"));
      args.push("-map", needVideoFx ? `[${vOut}]` : "0:v");
      args.push("-map", needAudioFx ? `[${aOut}]` : "0:a");
      args.push("-t", total.toFixed(2));
      args.push(...(needVideoFx ? ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"] : ["-c:v", "copy"]));
      args.push(...(needAudioFx ? ["-c:a", "aac", "-ar", "44100", "-ac", "2"] : ["-c:a", "copy"]));
      args.push("-movflags", "+faststart", outPath);
      await run(args, 20 * 60 * 1000);
    }

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

    // Sidecar caption files from the same canonical document (accessibility /
    // platform-native captions). Stored alongside the render.
    let captionSrtUrl = "";
    let captionVttUrl = "";
    if (captionDoc && captionDoc.scenes.some((s) => s.caption.captionGroups.length > 0)) {
      const srt = await storeFile(
        brand,
        Buffer.from(buildSrt(captionDoc), "utf8"),
        `project-${job.id}.srt`,
        "application/x-subrip",
      );
      const vtt = await storeFile(
        brand,
        Buffer.from(buildVtt(captionDoc), "utf8"),
        `project-${job.id}.vtt`,
        "text/vtt",
      );
      captionSrtUrl = srt.url;
      captionVttUrl = vtt.url;
      for (const c of [srt, vtt]) {
        await prisma.mediaAsset.create({
          data: {
            brandId: job.brandId,
            kind: "caption",
            url: c.url,
            storageKey: c.storageKey,
            mimeType: c.url.endsWith(".vtt") ? "text/vtt" : "application/x-subrip",
          },
        });
      }
    }

    await prisma.videoProject.update({
      where: { id: job.id },
      data: {
        status: "DONE",
        outputUrl: stored.url,
        error: "",
        captionSrtUrl,
        captionVttUrl,
      },
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
