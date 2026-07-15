import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  brandId: z.string().nullable().optional(),
  aspect: z.enum(["9:16", "1:1", "16:9", "4:5"]).optional(),
  clipCount: z.number().int().min(1).max(3).optional(),
  perClipSeconds: z.number().min(1).max(15).optional(),
  transition: z.enum(["fade", "cut"]).optional(),
  kenburns: z.enum(["in", "out", "left", "right", "none"]).optional(),
  captionStyleId: z.string().nullable().optional(),
  musicTrackId: z.string().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const template = await prisma.videoTemplate.update({ where: { id }, data: body });
    return NextResponse.json(template);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    await prisma.videoTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
