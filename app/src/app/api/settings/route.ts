import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getSettings, SETTING_DEFS } from "@/lib/settings";

export async function GET() {
  try {
    await requireAdmin();
    const values = await getSettings(prisma);
    return NextResponse.json({
      defs: SETTING_DEFS,
      values,
      mock: { ai: !values.FAL_KEY, tts: !values.ELEVENLABS_KEY },
    });
  } catch (err) {
    return jsonError(err);
  }
}

const putSchema = z.record(z.string(), z.string());

export async function PUT(req: NextRequest) {
  try {
    await requireAdmin();
    const body = putSchema.parse(await req.json());
    const validKeys = new Set(SETTING_DEFS.map((d) => d.key));
    for (const [key, value] of Object.entries(body)) {
      if (!validKeys.has(key as (typeof SETTING_DEFS)[number]["key"])) continue;
      await prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
