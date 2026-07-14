import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { storeFile } from "@/lib/storage";

export async function GET() {
  try {
    await requireSession();
    const tracks = await prisma.musicTrack.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json(tracks);
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const form = await req.formData();
    const file = form.get("file");
    const name = ((form.get("name") as string) || "").trim();
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file field is required" }, { status: 400 });
    }
    if (!file.type.startsWith("audio/")) {
      return NextResponse.json({ error: "Only audio files are allowed" }, { status: 415 });
    }
    if (file.size > 30 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 30 MB)" }, { status: 413 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storeFile(null, buffer, file.name, file.type);
    const track = await prisma.musicTrack.create({
      data: {
        name: name || file.name.replace(/\.[^.]+$/, ""),
        url: stored.url,
        storageKey: stored.storageKey,
        source: "upload",
      },
    });
    return NextResponse.json(track, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
