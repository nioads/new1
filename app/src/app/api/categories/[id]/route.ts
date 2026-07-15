import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";

const patchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  muted: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const category = await prisma.category.update({
      where: { id },
      data: body,
      include: { _count: { select: { feeds: true, items: true } } },
    });
    return NextResponse.json(category);
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
    const feedCount = await prisma.feed.count({ where: { categoryId: id } });
    if (feedCount > 0) {
      return NextResponse.json(
        { error: `Category has ${feedCount} feed(s) — reassign them first` },
        { status: 409 },
      );
    }
    await prisma.newsItem.deleteMany({ where: { categoryId: id } });
    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
