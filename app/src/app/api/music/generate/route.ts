import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { storeFile } from "@/lib/storage";

const schema = z.object({
  prompt: z.string().min(3).max(600),
  durationSec: z.number().min(5).max(120).default(30),
});

// Generates a music track with ElevenLabs Music (requires the API key
// configured on the Settings page).
export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const body = schema.parse(await req.json());
    const settings = await getSettings(prisma);
    if (!settings.ELEVENLABS_KEY) {
      return NextResponse.json(
        { error: "ElevenLabs API key is not configured — add it on the Settings page" },
        { status: 400 },
      );
    }
    const res = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: {
        "xi-api-key": settings.ELEVENLABS_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: body.prompt,
        music_length_ms: Math.round(body.durationSec * 1000),
      }),
      signal: AbortSignal.timeout(300000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return NextResponse.json(
        { error: `ElevenLabs music HTTP ${res.status}: ${detail}` },
        { status: 502 },
      );
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const stored = await storeFile(null, buffer, "generated.mp3", "audio/mpeg");
    const track = await prisma.musicTrack.create({
      data: {
        name: body.prompt.slice(0, 60),
        url: stored.url,
        storageKey: stored.storageKey,
        durationSec: body.durationSec,
        source: "elevenlabs",
      },
    });
    return NextResponse.json(track, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
