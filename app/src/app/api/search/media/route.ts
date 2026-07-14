import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { searchMedia } from "@/lib/ai";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const q = req.nextUrl.searchParams.get("q")?.trim();
    const source = (req.nextUrl.searchParams.get("source") ?? "searxng") as
      | "searxng"
      | "pexels"
      | "pixabay";
    const kind = (req.nextUrl.searchParams.get("kind") ?? "image") as "image" | "video";
    if (!q) return NextResponse.json({ error: "q is required" }, { status: 400 });
    const settings = await getSettings(prisma);
    const results = await searchMedia(settings, q, source, kind);
    return NextResponse.json({ results });
  } catch (err) {
    return jsonError(err);
  }
}
