import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { generateSceneGroups } from "@/lib/scene-captions";

const schema = z.object({
  mode: z.enum(["heuristic", "ai"]).default("heuristic"),
  applyToAll: z.boolean().default(false),
});

// (Re)generates caption groups for a scene from its word timings. With
// applyToAll, regroups every scene in the project. Locked groups are preserved.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const body = schema.parse(await req.json().catch(() => ({})));
    const scene = await prisma.scene.findUnique({ where: { id } });
    if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.applyToAll) {
      const scenes = await prisma.scene.findMany({
        where: { projectId: scene.projectId },
        select: { id: true },
      });
      for (const s of scenes) await generateSceneGroups(prisma, s.id, { mode: body.mode });
    } else {
      await generateSceneGroups(prisma, id, { mode: body.mode });
    }

    const updated = await prisma.scene.findUnique({ where: { id } });
    return NextResponse.json(updated);
  } catch (err) {
    return jsonError(err);
  }
}
