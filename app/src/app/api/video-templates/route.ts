import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export async function GET() {
  try {
    await requireSession();
    const templates = await prisma.videoTemplate.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json(templates);
  } catch (err) {
    return jsonError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  brandId: z.string().nullable().optional(),
  aspect: z.enum(["9:16", "1:1", "16:9", "4:5"]).default("9:16"),
  clipCount: z.number().int().min(1).max(3).default(1),
  perClipSeconds: z.number().min(1).max(15).default(4),
  transition: z.enum(["fade", "cut"]).default("fade"),
  kenburns: z.enum(["in", "out", "left", "right", "none"]).default("in"),
  captionStyleId: z.string().nullable().optional(),
  musicTrackId: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const b = createSchema.parse(await req.json());
    const template = await prisma.videoTemplate.create({
      data: {
        name: b.name.trim(),
        brandId: b.brandId ?? null,
        aspect: b.aspect,
        clipCount: b.clipCount,
        perClipSeconds: b.perClipSeconds,
        transition: b.transition,
        kenburns: b.kenburns,
        captionStyleId: b.captionStyleId ?? null,
        musicTrackId: b.musicTrackId ?? null,
      },
    });
    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
