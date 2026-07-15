import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { generateImage } from "@/lib/ai";
import { storeFile } from "@/lib/storage";

const schema = z.object({ prompt: z.string().min(3).max(2000) });

// Generates an AI image for a scene (prompt shown and editable in the UI).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const body = schema.parse(await req.json());
    const scene = await prisma.scene.findUnique({ where: { id }, include: { project: true } });
    if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const settings = await getSettings(prisma);
    const buffer = await generateImage(
      settings,
      body.prompt,
      scene.project.width,
      scene.project.height,
    );
    const brand = scene.project.brandId
      ? await prisma.brand.findUnique({ where: { id: scene.project.brandId } })
      : null;
    const stored = await storeFile(brand, buffer, `scene-${id}.png`, "image/png");

    const updated = await prisma.scene.update({
      where: { id },
      data: { imageUrl: stored.url, imagePrompt: body.prompt },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return jsonError(err);
  }
}
