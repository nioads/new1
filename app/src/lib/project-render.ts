// Article→Video assembly: renders each scene (visual + Ken Burns + narration)
// to a uniform segment, then concatenates segments with per-scene fade
// transitions and an optional looping music bed. Scene-chunked so long
// videos stay tractable.
import { spawn } from "child_process";
import { mkdir, readFile, rm } from "fs/promises";
import path from "path";
import type { PrismaClient, Scene } from "../generated/prisma/client";
import { mediaDir, storeFile } from "./storage";
import { resolveToLocalFile } from "./media-path";
import { generateImage } from "./ai";
import { getSettings } from "./settings";

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

function kenburns(kind: string, w: number, h: number, seconds: number): string {
  const frames = Math.max(1, Math.round(seconds * FPS));
  const z = 0.14;
  const centered = `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
  let zp: string;
  switch (kind) {
    case "out":
      zp = `zoompan=z='${1 + z}-${z}*on/${frames}':${centered}`;
      break;
    case "left":
      zp = `zoompan=z='1.1':x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)'`;
      break;
    case "right":
      zp = `zoompan=z='1.1':x='(iw-iw/zoom)*on/${frames}':y='ih/2-(ih/zoom/2)'`;
      break;
    case "none":
      zp = `zoompan=z='1':${centered}`;
      break;
    default:
      zp = `zoompan=z='1+${z}*on/${frames}':${centered}`;
  }
  return `scale=${w * 2}:-2,${zp}:d=${frames}:s=${w}x${h}:fps=${FPS},setsar=1`;
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

  const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];
  let videoFilter: string;
  if (!opts.imagePath) {
    args.push("-f", "lavfi", "-i", `color=c=0x0f172a:s=${width}x${height}:d=${duration}`);
    videoFilter = `fps=${FPS},setsar=1${fadeF}`;
  } else if (opts.isVideoVisual) {
    args.push("-stream_loop", "-1", "-i", opts.imagePath);
    videoFilter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${FPS},setsar=1${fadeF}`;
  } else {
    args.push("-i", opts.imagePath);
    videoFilter = `${kenburns(scene.kenburns, width, height, duration)}${fadeF}`;
  }
  if (opts.ttsPath) {
    args.push("-i", opts.ttsPath);
  } else {
    args.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo");
  }
  args.push(
    "-filter_complex",
    `[0:v]${videoFilter}[v];[1:a]apad,aresample=44100[a]`,
    "-map", "[v]", "-map", "[a]",
    "-t", duration.toFixed(2),
    "-r", String(FPS),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-ar", "44100", "-ac", "2",
    opts.outPath,
  );
  await run(args);
  return duration;
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

    // 1. render each scene to a uniform segment
    const segments: string[] = [];
    let total = 0;
    for (const [i, scene] of scenes.entries()) {
      let imagePath: string | null = null;
      let isVideoVisual = false;
      if (scene.imageUrl) {
        const resolved = await resolveToLocalFile(scene.imageUrl, `project-tmp/${job.id}`);
        imagePath = resolved.path;
        isVideoVisual = !IMAGE_EXT.test(scene.imageUrl) && /\.(mp4|m4v|mov|webm|m3u8)(\?|#|$)/i.test(scene.imageUrl);
      } else {
        // no visual chosen — generate one (mock-safe) from the scene prompt/query
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
        ttsPath = (await resolveToLocalFile(scene.ttsUrl, `project-tmp/${job.id}`)).path;
      }
      const segPath = path.join(workDir, `seg-${String(i).padStart(3, "0")}.mp4`);
      total += await renderSceneSegment({
        scene,
        imagePath,
        ttsPath,
        width: job.width,
        height: job.height,
        outPath: segPath,
        isVideoVisual,
      });
      segments.push(segPath);
      console.log(`[project] ${job.id} scene ${i + 1}/${scenes.length} rendered`);
    }

    // 2. concatenate + optional music bed
    const outPath = path.join(workDir, "final.mp4");
    const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];
    for (const seg of segments) args.push("-i", seg);

    let musicPath: string | null = null;
    if (job.musicTrackId) {
      const track = await prisma.musicTrack.findUnique({ where: { id: job.musicTrackId } });
      if (track) musicPath = (await resolveToLocalFile(track.url, `project-tmp/${job.id}`)).path;
    }
    if (musicPath) args.push("-stream_loop", "-1", "-i", musicPath);

    const pairs = segments.map((_, i) => `[${i}:v][${i}:a]`).join("");
    let filter = `${pairs}concat=n=${segments.length}:v=1:a=1[v][na]`;
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
    const brand = job.brandId ? await prisma.brand.findUnique({ where: { id: job.brandId } }) : null;
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
