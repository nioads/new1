import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { generateSceneGroups } from "@/lib/scene-captions";

// Queues a per-scene preview render. The worker renders the scene independently
// (media + framing + voice-over + captions + overlays) using the same Remotion
// caption engine as the final export, then marks it PREVIEW_READY.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const scene = await prisma.scene.findUnique({ where: { id } });
    if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // ensure caption groups exist before previewing
    if (!scene.captionGroups) await generateSceneGroups(prisma, id).catch(() => {});

    const updated = await prisma.scene.update({
      where: { id },
      data: { status: "QUEUED", previewError: "" },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return jsonError(err);
  }
}
