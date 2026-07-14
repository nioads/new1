import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { generateVideo } from "@/lib/ai";
import { storeFile } from "@/lib/storage";
import { resolveToLocalFile } from "@/lib/media-path";

const schema = z.object({ prompt: z.string().min(3).max(2000) });

// Animates a scene with the configured AI video model (image-to-video when
// the scene has an image). Mock mode produces a motion clip without a key.
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
    let imagePath: string | null = null;
    const isImage = /\.(jpe?g|png|gif|webp|avif|bmp)(\?|#|$)/i.test(scene.imageUrl);
    if (scene.imageUrl && isImage) {
      imagePath = (await resolveToLocalFile(scene.imageUrl, "render-tmp")).path;
    }

    const buffer = await generateVideo(
      settings,
      body.prompt,
      imagePath,
      scene.project.width,
      scene.project.height,
    );
    const brand = scene.project.brandId
      ? await prisma.brand.findUnique({ where: { id: scene.project.brandId } })
      : null;
    const stored = await storeFile(brand, buffer, `scene-${id}.mp4`, "video/mp4");

    const updated = await prisma.scene.update({
      where: { id },
      data: { imageUrl: stored.url, imagePrompt: body.prompt },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return jsonError(err);
  }
}
