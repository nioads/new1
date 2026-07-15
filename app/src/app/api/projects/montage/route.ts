import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";

const MAX_TOTAL_SECONDS = 15;

const DIMS: Record<string, [number, number]> = {
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "16:9": [1920, 1080],
  "4:5": [1080, 1350],
};

// Create a short-video (montage) project: 1–3 animated photo/video clips, no
// article. Seeded from a saved VideoTemplate or from ad-hoc params. Reuses the
// scene pipeline (Ken Burns, transitions, captions, music, logo, preview).
const schema = z.object({
  templateId: z.string().optional(),
  title: z.string().max(120).optional(),
  brandId: z.string().nullable().optional(),
  aspect: z.enum(["9:16", "1:1", "16:9", "4:5"]).optional(),
  clipCount: z.number().int().min(1).max(3).optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const b = schema.parse(await req.json().catch(() => ({})));

    const tpl = b.templateId
      ? await prisma.videoTemplate.findUnique({ where: { id: b.templateId } })
      : null;

    const aspect = b.aspect ?? tpl?.aspect ?? "9:16";
    const clipCount = Math.min(3, Math.max(1, b.clipCount ?? tpl?.clipCount ?? 1));
    const [width, height] = DIMS[aspect] ?? DIMS["9:16"];
    const brandId = b.brandId ?? tpl?.brandId ?? null;
    const brand = brandId ? await prisma.brand.findUnique({ where: { id: brandId } }) : null;

    // per-clip duration, capped so the whole video stays ≤ 15s
    const perClip = Math.min(tpl?.perClipSeconds ?? 4, MAX_TOTAL_SECONDS / clipCount);
    const transition = tpl?.transition ?? "fade";
    const kenburns = tpl?.kenburns ?? "in";

    const project = await prisma.videoProject.create({
      data: {
        kind: "montage",
        itemId: null,
        title: (b.title ?? tpl?.name ?? "Short video").slice(0, 120),
        aspect,
        width,
        height,
        brandId,
        captionStyleId: tpl?.captionStyleId ?? brand?.captionStyleId ?? null,
        musicTrackId: tpl?.musicTrackId ?? null,
        visualMode: "search",
        scenes: {
          create: Array.from({ length: clipCount }, (_, i) => ({
            order: i,
            text: "",
            durationSec: perClip,
            kenburns,
            transition,
            fit: "cover",
          })),
        },
      },
      include: { scenes: { orderBy: { order: "asc" } } },
    });
    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
