import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const item = await prisma.newsItem.findUnique({
      where: { id },
      include: {
        feed: { select: { id: true, title: true, url: true, brandId: true } },
        category: { select: { id: true, name: true, color: true } },
        media: true,
      },
    });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(item);
  } catch (err) {
    return jsonError(err);
  }
}

const patchSchema = z.object({ read: z.boolean() });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const item = await prisma.newsItem.update({
      where: { id },
      data: { readAt: body.read ? new Date() : null },
    });
    return NextResponse.json(item);
  } catch (err) {
    return jsonError(err);
  }
}
