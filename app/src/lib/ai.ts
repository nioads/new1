// Provider layer for AI + search services. Every function degrades to a
// deterministic mock when the corresponding key is missing (see settings.ts),
// keeping the full article→video pipeline testable without accounts.
import { spawn } from "child_process";
import { mkdir, readFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { aiMocked, ttsMocked, type Settings } from "./settings";
import { mediaDir } from "./storage";

// ---------- script generation ----------

export type GeneratedScene = { text: string; imageQuery: string };
export type GeneratedScript = { script: string; scenes: GeneratedScene[] };

export function defaultScriptPrompt(aspect: string): string {
  return `You are a professional news video scriptwriter. Write a narration script for a ${aspect} social news video based on the article below.
Rules: hook the viewer in the first sentence; one idea per scene; short spoken sentences; neutral news tone; keep the article's language (Arabic stays Arabic, English stays English).
Split the script into scenes. For each scene also provide a short English image search query describing the ideal visual.
Respond ONLY with JSON: {"scenes":[{"text":"...","imageQuery":"..."}]}`;
}

export async function generateScript(
  settings: Settings,
  article: { title: string; content: string },
  opts: { prompt: string; sceneCount: number },
): Promise<GeneratedScript> {
  if (aiMocked(settings)) {
    // deterministic mock: split article text into sentence groups
    const text = `${article.title}. ${article.content}`.replace(/\s+/g, " ").trim();
    const sentences = text.split(/(?<=[.!؟?۔])\s+/).filter((s) => s.length > 8);
    const per = Math.max(1, Math.ceil(sentences.length / opts.sceneCount));
    const scenes: GeneratedScene[] = [];
    for (let i = 0; i < sentences.length && scenes.length < opts.sceneCount; i += per) {
      scenes.push({
        text: sentences.slice(i, i + per).join(" "),
        imageQuery: article.title.split(/\s+/).slice(0, 5).join(" "),
      });
    }
    return { script: scenes.map((s) => s.text).join("\n\n"), scenes };
  }

  const res = await fetch("https://fal.run/fal-ai/any-llm", {
    method: "POST",
    headers: {
      Authorization: `Key ${settings.FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.LLM_MODEL,
      prompt: `${opts.prompt}\n\nTarget scene count: ${opts.sceneCount}\n\nARTICLE TITLE: ${article.title}\n\nARTICLE:\n${article.content.slice(0, 24000)}`,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { output?: string };
  const raw = data.output ?? "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("LLM returned no JSON");
  const parsed = JSON.parse(jsonMatch[0]) as { scenes?: GeneratedScene[] };
  const scenes = (parsed.scenes ?? []).filter((s) => s.text?.trim());
  if (scenes.length === 0) throw new Error("LLM returned no scenes");
  return { script: scenes.map((s) => s.text).join("\n\n"), scenes };
}

// ---------- TTS ----------

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let err = "";
    p.stderr.on("data", (d) => (err = (err + d).slice(-2000)));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(-400)}`)),
    );
  });
}

export async function ffprobeDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.env.FFPROBE_PATH ?? "ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath,
    ]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("close", () => resolve(parseFloat(out.trim()) || 0));
  });
}

// Generates narration audio for one scene; returns a local temp file path.
export async function synthesizeSpeech(
  settings: Settings,
  text: string,
): Promise<{ path: string; duration: number }> {
  const dir = path.join(mediaDir(), "tts-tmp");
  await mkdir(dir, { recursive: true });
  const out = path.join(dir, `${crypto.randomBytes(6).toString("hex")}.mp3`);

  if (ttsMocked(settings)) {
    // mock: quiet tone whose length approximates natural speech pace
    const words = text.trim().split(/\s+/).length;
    const duration = Math.min(30, Math.max(2, words / 2.4));
    await run(process.env.FFMPEG_PATH ?? "ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", `sine=frequency=440:duration=${duration.toFixed(2)}`,
      "-af", "volume=0.08",
      "-c:a", "libmp3lame", "-q:a", "6", out,
    ]);
    return { path: out, duration };
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${settings.TTS_VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": settings.ELEVENLABS_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, model_id: settings.TTS_MODEL }),
      signal: AbortSignal.timeout(120000),
    },
  );
  if (!res.ok) throw new Error(`TTS HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const { writeFile } = await import("fs/promises");
  await writeFile(out, buffer);
  const duration = await ffprobeDuration(out);
  return { path: out, duration };
}

// ---------- transcription (word-level timestamps for captions) ----------

import { estimateWords, type CaptionWord } from "./captions";

export async function transcribeWords(
  settings: Settings,
  audioPath: string,
  fallbackText: string,
  fallbackDuration: number,
): Promise<CaptionWord[]> {
  if (aiMocked(settings)) {
    return estimateWords(fallbackText, fallbackDuration);
  }
  try {
    const audio = await readFile(audioPath);
    const res = await fetch("https://fal.run/fal-ai/whisper", {
      method: "POST",
      headers: {
        Authorization: `Key ${settings.FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: `data:audio/mpeg;base64,${audio.toString("base64")}`,
        task: "transcribe",
        chunk_level: "word",
      }),
      signal: AbortSignal.timeout(300000),
    });
    if (!res.ok) throw new Error(`Whisper HTTP ${res.status}`);
    const data = (await res.json()) as {
      chunks?: Array<{ text: string; timestamp: [number, number] }>;
    };
    const words = (data.chunks ?? [])
      .map((c) => ({ w: c.text.trim(), s: c.timestamp?.[0] ?? 0, e: c.timestamp?.[1] ?? 0 }))
      .filter((w) => w.w && w.e > w.s);
    if (words.length === 0) throw new Error("no word chunks");
    return words;
  } catch (err) {
    console.error("[whisper] falling back to estimated timings:", err);
    return estimateWords(fallbackText, fallbackDuration);
  }
}

// ---------- image generation ----------

export async function generateImage(
  settings: Settings,
  prompt: string,
  width: number,
  height: number,
): Promise<Buffer> {
  if (aiMocked(settings)) {
    // mock: labeled flat-color frame
    const dir = path.join(mediaDir(), "tts-tmp");
    await mkdir(dir, { recursive: true });
    const out = path.join(dir, `${crypto.randomBytes(6).toString("hex")}.png`);
    const hue = Math.abs([...prompt].reduce((a, c) => a + c.charCodeAt(0), 0)) % 360;
    await run(process.env.FFMPEG_PATH ?? "ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi",
      "-i", `color=c=hsv(${hue}\\,0.6\\,0.5):s=${width}x${height}:d=1,format=rgb24`,
      "-frames:v", "1", out,
    ]);
    return readFile(out);
  }

  const res = await fetch(`https://fal.run/${settings.IMAGE_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${settings.FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_size: { width: Math.min(width, 1920), height: Math.min(height, 1920) },
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) throw new Error(`Image gen HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { images?: Array<{ url: string }> };
  const url = data.images?.[0]?.url;
  if (!url) throw new Error("Image model returned no image");
  const img = await fetch(url, { signal: AbortSignal.timeout(120000) });
  return Buffer.from(await img.arrayBuffer());
}

// ---------- video generation (scene animation) ----------

export async function generateVideo(
  settings: Settings,
  prompt: string,
  imagePath: string | null, // local file for image-to-video; null → text/mock
  width: number,
  height: number,
): Promise<Buffer> {
  if (aiMocked(settings)) {
    // mock: 4s animated clip (Ken Burns on the image, or a test pattern)
    const dir = path.join(mediaDir(), "tts-tmp");
    await mkdir(dir, { recursive: true });
    const out = path.join(dir, `${crypto.randomBytes(6).toString("hex")}.mp4`);
    const args = ["-y", "-hide_banner", "-loglevel", "error"];
    if (imagePath) {
      args.push(
        "-i", imagePath,
        "-vf",
        `scale=${width * 2}:-2,zoompan=z='1+0.2*on/100':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=100:s=${width}x${height}:fps=25,setsar=1`,
      );
    } else {
      args.push("-f", "lavfi", "-i", `testsrc2=size=${width}x${height}:rate=25:duration=4`);
    }
    args.push("-t", "4", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-an", out);
    await run(process.env.FFMPEG_PATH ?? "ffmpeg", args);
    return readFile(out);
  }

  const body: Record<string, unknown> = { prompt };
  if (imagePath) {
    const img = await readFile(imagePath);
    body.image_url = `data:image/png;base64,${img.toString("base64")}`;
  }
  const res = await fetch(`https://fal.run/${settings.VIDEO_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${settings.FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  if (!res.ok) throw new Error(`Video gen HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { video?: { url: string } };
  if (!data.video?.url) throw new Error("Video model returned no video");
  const video = await fetch(data.video.url, { signal: AbortSignal.timeout(300000) });
  return Buffer.from(await video.arrayBuffer());
}

// ---------- image/video search ----------

export type SearchResult = {
  url: string;
  thumb: string;
  title: string;
  source: string;
  kind: "image" | "video";
};

export async function searchMedia(
  settings: Settings,
  query: string,
  source: "searxng" | "pexels" | "pixabay",
  kind: "image" | "video",
): Promise<SearchResult[]> {
  if (source === "searxng") {
    const base = settings.SEARXNG_URL.replace(/\/$/, "");
    const categories = kind === "image" ? "images" : "videos";
    const res = await fetch(
      `${base}/search?q=${encodeURIComponent(query)}&categories=${categories}&format=json`,
      { signal: AbortSignal.timeout(20000), headers: { accept: "application/json" } },
    );
    if (!res.ok) throw new Error(`SearxNG HTTP ${res.status} — is the searxng container running?`);
    const data = (await res.json()) as {
      results?: Array<{ img_src?: string; thumbnail_src?: string; url?: string; title?: string }>;
    };
    return (data.results ?? [])
      .map((r) => ({
        url: r.img_src ?? r.url ?? "",
        thumb: r.thumbnail_src ?? r.img_src ?? "",
        title: r.title ?? "",
        source: "searxng",
        kind,
      }))
      .filter((r) => r.url)
      .slice(0, 30);
  }

  if (source === "pexels") {
    if (!settings.PEXELS_KEY) throw new Error("Pexels API key not set (Settings page)");
    const endpoint =
      kind === "image"
        ? `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=30`
        : `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=20`;
    const res = await fetch(endpoint, {
      headers: { Authorization: settings.PEXELS_KEY },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`);
    if (kind === "image") {
      const data = (await res.json()) as {
        photos?: Array<{ src: { large2x: string; medium: string }; alt: string }>;
      };
      return (data.photos ?? []).map((p) => ({
        url: p.src.large2x,
        thumb: p.src.medium,
        title: p.alt ?? "",
        source: "pexels",
        kind,
      }));
    }
    const data = (await res.json()) as {
      videos?: Array<{
        image: string;
        video_files: Array<{ link: string; width: number }>;
      }>;
    };
    return (data.videos ?? []).map((v) => ({
      url: v.video_files.sort((a, b) => b.width - a.width)[0]?.link ?? "",
      thumb: v.image,
      title: "",
      source: "pexels",
      kind,
    }));
  }

  // pixabay
  if (!settings.PIXABAY_KEY) throw new Error("Pixabay API key not set (Settings page)");
  const endpoint =
    kind === "image"
      ? `https://pixabay.com/api/?key=${settings.PIXABAY_KEY}&q=${encodeURIComponent(query)}&per_page=30`
      : `https://pixabay.com/api/videos/?key=${settings.PIXABAY_KEY}&q=${encodeURIComponent(query)}&per_page=20`;
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Pixabay HTTP ${res.status}`);
  if (kind === "image") {
    const data = (await res.json()) as {
      hits?: Array<{ largeImageURL: string; previewURL: string; tags: string }>;
    };
    return (data.hits ?? []).map((h) => ({
      url: h.largeImageURL,
      thumb: h.previewURL,
      title: h.tags,
      source: "pixabay",
      kind,
    }));
  }
  const data = (await res.json()) as {
    hits?: Array<{ videos: { large?: { url: string }; medium?: { url: string } }; picture_id?: string; tags: string }>;
  };
  return (data.hits ?? []).map((h) => ({
    url: h.videos.large?.url ?? h.videos.medium?.url ?? "",
    thumb: "",
    title: h.tags,
    source: "pixabay",
    kind,
  }));
}
