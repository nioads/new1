// Provider layer for AI + search services. Every function degrades to a
// deterministic mock when the corresponding key is missing (see settings.ts),
// keeping the full article→video pipeline testable without accounts.
import { spawn } from "child_process";
import { mkdir, readFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { aiMocked, ttsMocked, llmMocked, type Settings } from "./settings";
import { mediaDir } from "./storage";

// Routes a text prompt to the configured LLM provider (fal any-llm or a local
// Ollama server running e.g. gemma). Returns the raw completion text.
export async function generateText(
  settings: Settings,
  prompt: string,
  modelOverride?: string,
): Promise<string> {
  if (settings.LLM_PROVIDER === "ollama") {
    const base = settings.OLLAMA_URL.replace(/\/$/, "");
    const res = await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelOverride || settings.OLLAMA_MODEL,
        prompt,
        stream: false,
      }),
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { response?: string };
    return data.response ?? "";
  }
  const res = await fetch("https://fal.run/fal-ai/any-llm", {
    method: "POST",
    headers: { Authorization: `Key ${settings.FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelOverride || settings.LLM_MODEL, prompt }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { output?: string };
  return data.output ?? "";
}

function extractJson(raw: string): unknown {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("model returned no JSON");
  return JSON.parse(match[0]);
}

// ---------- script generation ----------

export type GeneratedScene = { text: string; imageQuery: string };
export type GeneratedScript = { script: string; scenes: GeneratedScene[] };

export function defaultScriptPrompt(aspect: string): string {
  return `You are a professional news video scriptwriter. Write a narration script for a ${aspect} social news video based on the article below.
Rules: hook the viewer in the first sentence; one idea per scene; short spoken sentences; neutral news tone.
Split the script into scenes. For each scene also provide a short English image search query describing the ideal visual.
Respond ONLY with JSON: {"scenes":[{"text":"...","imageQuery":"..."}]}`;
}

// Supported output languages for generated text. "" = keep the source
// article's language (auto). The image search query always stays English so
// stock/media search works regardless of the narration language.
export const SCRIPT_LANGUAGES: Array<{ code: string; label: string; name: string }> = [
  { code: "", label: "Auto (match article)", name: "" },
  { code: "ar", label: "Arabic", name: "Modern Standard Arabic (العربية الفصحى)" },
  { code: "en", label: "English", name: "English" },
  { code: "fr", label: "French", name: "French (Français)" },
  { code: "es", label: "Spanish", name: "Spanish (Español)" },
  { code: "tr", label: "Turkish", name: "Turkish (Türkçe)" },
  { code: "de", label: "German", name: "German (Deutsch)" },
];

// Builds an explicit, hard-to-ignore language directive appended to the prompt.
function languageDirective(code?: string): string {
  if (!code) {
    return "\n\nLANGUAGE: Write all narration text in the SAME language as the source article.";
  }
  const lang = SCRIPT_LANGUAGES.find((l) => l.code === code);
  const name = lang?.name || code;
  return `\n\nLANGUAGE (STRICT): Write ALL narration "text" fields in ${name}, EVEN IF the source article is written in a different language — translate the meaning faithfully into ${name}. Do not mix languages in the narration. Keep each "imageQuery" in English.`;
}

export async function generateScript(
  settings: Settings,
  article: { title: string; content: string },
  opts: { prompt: string; sceneCount: number; model?: string; language?: string },
): Promise<GeneratedScript> {
  if (llmMocked(settings)) {
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

  const raw = await generateText(
    settings,
    `${opts.prompt}${languageDirective(opts.language)}\n\nTarget scene count: ${opts.sceneCount}\n\nARTICLE TITLE: ${article.title}\n\nARTICLE:\n${article.content.slice(0, 24000)}`,
    opts.model,
  );
  const parsed = extractJson(raw) as { scenes?: GeneratedScene[] };
  const scenes = (parsed.scenes ?? []).filter((s) => s.text?.trim());
  if (scenes.length === 0) throw new Error("LLM returned no scenes");
  return { script: scenes.map((s) => s.text).join("\n\n"), scenes };
}

// Generates social-media metadata for a piece of content: a short punchy
// highlight (overlay headline), an SM caption, a YouTube-style description,
// and hashtags/tags. Works via fal or Ollama; mock produces sensible text.
export type ContentMeta = {
  highlight: string;
  caption: string;
  description: string;
  tags: string[];
};

export async function generateMetadata(
  settings: Settings,
  content: { title: string; body: string; lang?: string },
): Promise<ContentMeta> {
  if (llmMocked(settings)) {
    const clean = `${content.title}. ${content.body}`.replace(/\s+/g, " ").trim();
    const firstSentence = clean.split(/(?<=[.!؟?۔])\s+/)[0] ?? content.title;
    const words = content.title
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 6);
    return {
      highlight: content.title.slice(0, 80),
      caption: `${firstSentence.slice(0, 180)}`,
      description: clean.slice(0, 500),
      tags: [...new Set(words.map((w) => w.toLowerCase()))],
    };
  }
  const langCode = content.lang;
  const langName = SCRIPT_LANGUAGES.find((l) => l.code === langCode)?.name;
  const target = langName
    ? `${langName} (translate if the source is in another language)`
    : "the content's language";
  const prompt = `You are a social media editor. For the news content below, respond ONLY with JSON:
{"highlight":"a very short punchy headline (max 8 words) to overlay on the image/video, in ${target}",
 "caption":"an engaging social media caption with 1-2 relevant emojis, in ${target}",
 "description":"a longer YouTube-style description (2-4 sentences), in ${target}",
 "tags":["8-12 lowercase hashtag-style keywords, no # symbol, mix of ${target} and English"]}

TITLE: ${content.title}

CONTENT:
${content.body.slice(0, 12000)}`;
  const raw = await generateText(settings, prompt);
  const parsed = extractJson(raw) as Partial<ContentMeta>;
  return {
    highlight: (parsed.highlight ?? content.title).toString().slice(0, 120),
    caption: (parsed.caption ?? "").toString().slice(0, 600),
    description: (parsed.description ?? "").toString().slice(0, 2000),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t)).slice(0, 15) : [],
  };
}

// ---------- caption grouping ----------
// Uses the LLM to split a transcript into short, meaning-based caption groups.
// Returns the number of words per group (so the caller maps groups back onto
// the timed word list). Returns null on any failure → caller uses the
// heuristic grouper instead.
export async function aiGroupCaptions(
  settings: Settings,
  words: string[],
  opts?: { minWords?: number; maxWords?: number },
): Promise<number[] | null> {
  if (llmMocked(settings) || words.length === 0) return null;
  const min = opts?.minWords ?? 2;
  const max = opts?.maxWords ?? 5;
  const numbered = words.map((w, i) => `${i + 1}:${w}`).join(" ");
  const prompt = `You segment a spoken transcript into short on-screen caption groups.
Rules: group by meaning and natural phrasing; ${min}-${max} words per group; keep names, numbers and units together; a strong final word may be its own group. Every word must be used exactly once, in order.
The transcript words are numbered:
${numbered}

Respond ONLY with JSON: {"groups":[<wordCount>, <wordCount>, ...]} where each number is how many consecutive words form that group, in order, summing to ${words.length}.`;
  try {
    const raw = await generateText(settings, prompt);
    const parsed = extractJson(raw) as { groups?: unknown };
    const groups = Array.isArray(parsed.groups) ? parsed.groups.map((n) => Number(n)) : [];
    if (groups.some((n) => !Number.isFinite(n))) return null;
    return groups;
  } catch {
    return null;
  }
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

export type VoiceInfo = { id: string; name: string; previewUrl: string; labels: string };

// Lists available ElevenLabs voices (distinct mock voices without a key so
// multi-voice flows stay testable).
export async function listVoices(settings: Settings): Promise<VoiceInfo[]> {
  if (ttsMocked(settings)) {
    return [
      { id: "mock-low", name: "Mock — Deep (no key)", previewUrl: "", labels: "mock" },
      { id: "mock-mid", name: "Mock — Neutral (no key)", previewUrl: "", labels: "mock" },
      { id: "mock-high", name: "Mock — Bright (no key)", previewUrl: "", labels: "mock" },
    ];
  }
  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": settings.ELEVENLABS_KEY },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Voices HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as {
    voices?: Array<{
      voice_id: string;
      name: string;
      preview_url?: string;
      labels?: Record<string, string>;
    }>;
  };
  return (data.voices ?? []).map((v) => ({
    id: v.voice_id,
    name: v.name,
    previewUrl: v.preview_url ?? "",
    labels: Object.values(v.labels ?? {}).join(", "),
  }));
}

// Generates narration audio for one scene; returns a local temp file path.
export async function synthesizeSpeech(
  settings: Settings,
  text: string,
  voiceId?: string,
): Promise<{ path: string; duration: number }> {
  const dir = path.join(mediaDir(), "tts-tmp");
  await mkdir(dir, { recursive: true });
  const out = path.join(dir, `${crypto.randomBytes(6).toString("hex")}.mp3`);
  const voice = voiceId || settings.TTS_VOICE_ID;

  if (ttsMocked(settings)) {
    // mock: quiet tone; pitch varies by voice so multi-voice is audible
    const words = text.trim().split(/\s+/).length;
    const duration = Math.min(30, Math.max(2, words / 2.4));
    const freq = 300 + (Math.abs([...voice].reduce((a, c) => a + c.charCodeAt(0), 0)) % 400);
    await run(process.env.FFMPEG_PATH ?? "ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${duration.toFixed(2)}`,
      "-af", "volume=0.08",
      "-c:a", "libmp3lame", "-q:a", "6", out,
    ]);
    return { path: out, duration };
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
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
    // deterministic muted color from the prompt (ffmpeg color wants hex/named)
    const h = Math.abs([...prompt].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7));
    const r = 40 + (h % 120);
    const g = 40 + ((h >> 3) % 120);
    const b = 40 + ((h >> 6) % 120);
    const hex = `0x${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    await run(process.env.FFMPEG_PATH ?? "ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi",
      "-i", `color=c=${hex}:s=${width}x${height}:d=1,format=rgb24`,
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
