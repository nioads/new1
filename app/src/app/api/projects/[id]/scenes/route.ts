import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";

const schema = z.object({
  afterOrder: z.number().int().min(-1).default(-1), // -1 = append at end
  text: z.string().default(""),
});

// Adds a new (empty) scene, inserted after the given position.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const body = schema.parse(await req.json());
    const project = await prisma.videoProject.findUnique({
      where: { id },
      include: { scenes: { orderBy: { order: "asc" } } },
    });
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const insertAt =
      body.afterOrder < 0 ? project.scenes.length : Math.min(body.afterOrder + 1, project.scenes.length);
    // shift subsequent scenes down
    await prisma.scene.updateMany({
      where: { projectId: id, order: { gte: insertAt } },
      data: { order: { increment: 1 } },
    });
    const scene = await prisma.scene.create({
      data: { projectId: id, order: insertAt, text: body.text },
    });
    return NextResponse.json(scene, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
