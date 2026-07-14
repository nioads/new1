import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { listVoices } from "@/lib/ai";

export async function GET() {
  try {
    await requireSession();
    const settings = await getSettings(prisma);
    const voices = await listVoices(settings);
    return NextResponse.json(voices);
  } catch (err) {
    return jsonError(err);
  }
}
