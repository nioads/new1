import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";

const moveSchema = z.object({ move: z.enum(["up", "down"]) });

// Reorders a scene within its project.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const body = moveSchema.parse(await req.json());
    const scene = await prisma.scene.findUnique({ where: { id } });
    if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const targetOrder = body.move === "up" ? scene.order - 1 : scene.order + 1;
    const other = await prisma.scene.findFirst({
      where: { projectId: scene.projectId, order: targetOrder },
    });
    if (!other) return NextResponse.json({ ok: true }); // already at the edge

    await prisma.$transaction([
      prisma.scene.update({ where: { id: other.id }, data: { order: scene.order } }),
      prisma.scene.update({ where: { id: scene.id }, data: { order: targetOrder } }),
    ]);
    return NextResponse.json({ ok: true });
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
    const scene = await prisma.scene.findUnique({ where: { id } });
    if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.scene.delete({ where: { id } });
    // close the gap
    await prisma.scene.updateMany({
      where: { projectId: scene.projectId, order: { gt: scene.order } },
      data: { order: { decrement: 1 } },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
