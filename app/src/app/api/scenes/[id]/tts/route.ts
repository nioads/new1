import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { synthesizeSpeech, transcribeWords } from "@/lib/ai";
import { generateSceneGroups } from "@/lib/scene-captions";
import { storeFile } from "@/lib/storage";
import { readFile, rm } from "fs/promises";

// Generates narration audio for one scene (per-scene TTS button).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const scene = await prisma.scene.findUnique({ where: { id }, include: { project: true } });
    if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!scene.text.trim()) {
      return NextResponse.json({ error: "Scene has no text" }, { status: 400 });
    }

    const settings = await getSettings(prisma);
    // voice priority: scene override → project default → settings default
    const voice = scene.voiceId || scene.project.voiceId || undefined;
    const speech = await synthesizeSpeech(settings, scene.text, voice);
    // word-level timestamps for burned-in captions
    const words = await transcribeWords(settings, speech.path, scene.text, speech.duration);
    const buffer = await readFile(speech.path);
    await rm(speech.path, { force: true }).catch(() => {});
    const brand = scene.project.brandId
      ? await prisma.brand.findUnique({ where: { id: scene.project.brandId } })
      : null;
    const stored = await storeFile(brand, buffer, `tts-${id}.mp3`, "audio/mpeg");

    await prisma.scene.update({
      where: { id },
      data: {
        ttsUrl: stored.url,
        ttsDuration: speech.duration,
        durationSec: Math.max(1.5, speech.duration + 0.6),
        words: JSON.parse(JSON.stringify(words)),
        // new narration → captions and any prior preview are stale
        status: "DRAFT",
        previewUrl: "",
      },
    });
    // (re)build caption groups from the fresh word timings
    await generateSceneGroups(prisma, id).catch(() => {});
    const updated = await prisma.scene.findUnique({ where: { id } });
    return NextResponse.json(updated);
  } catch (err) {
    return jsonError(err);
  }
}
