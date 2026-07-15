import type { PrismaClient } from "../generated/prisma/client";

// All configurable settings with their defaults. Secrets are stored in the
// Setting table so they're editable from the admin UI; env vars act as
// fallbacks for deploys that prefer configuration-as-environment.
export const SETTING_DEFS = [
  { key: "FAL_KEY", label: "fal.ai API key", secret: true, def: "" },
  { key: "ELEVENLABS_KEY", label: "ElevenLabs API key", secret: true, def: "" },
  { key: "PEXELS_KEY", label: "Pexels API key", secret: true, def: "" },
  { key: "PIXABAY_KEY", label: "Pixabay API key", secret: true, def: "" },
  { key: "SEARXNG_URL", label: "SearxNG URL", secret: false, def: "" },
  { key: "LLM_PROVIDER", label: "LLM provider (fal | ollama)", secret: false, def: "fal" },
  { key: "OLLAMA_URL", label: "Ollama base URL", secret: false, def: "http://host.docker.internal:11434" },
  { key: "OLLAMA_MODEL", label: "Ollama model (e.g. gemma2)", secret: false, def: "gemma2" },
  { key: "LLM_MODEL", label: "Script LLM model (fal any-llm)", secret: false, def: "openai/gpt-4o" },
  { key: "IMAGE_MODEL", label: "Image generation model (fal)", secret: false, def: "fal-ai/flux/schnell" },
  { key: "VIDEO_MODEL", label: "Scene animation model (fal)", secret: false, def: "fal-ai/kling-video/v2/master/image-to-video" },
  { key: "TTS_PROVIDER", label: "TTS provider", secret: false, def: "elevenlabs" },
  { key: "TTS_VOICE_ID", label: "ElevenLabs voice ID", secret: false, def: "pNInz6obpgDQGcFmaJgB" },
  { key: "TTS_MODEL", label: "ElevenLabs TTS model", secret: false, def: "eleven_multilingual_v2" },
] as const;

export type Settings = Record<(typeof SETTING_DEFS)[number]["key"], string>;

export async function getSettings(prisma: PrismaClient): Promise<Settings> {
  const rows = await prisma.setting.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as Settings;
  for (const def of SETTING_DEFS) {
    out[def.key] = byKey.get(def.key) || process.env[def.key] || def.def;
  }
  if (!out.SEARXNG_URL) {
    out.SEARXNG_URL = process.env.SEARXNG_URL || "http://localhost:8080";
  }
  return out;
}

// Mock mode: exercised automatically when the relevant API key is missing,
// so the whole pipeline stays testable without accounts.
// aiMocked governs image/video generation (fal only).
export function aiMocked(settings: Settings): boolean {
  return !settings.FAL_KEY;
}
export function ttsMocked(settings: Settings): boolean {
  return !settings.ELEVENLABS_KEY;
}
// Text/LLM generation can use fal or a local Ollama (gemma) server.
export function llmMocked(settings: Settings): boolean {
  if (settings.LLM_PROVIDER === "ollama") return !settings.OLLAMA_URL;
  return !settings.FAL_KEY;
}
