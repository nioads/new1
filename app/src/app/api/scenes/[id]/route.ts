import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";

const wordSchema = z.object({
  id: z.string(),
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  direction: z.enum(["rtl", "ltr"]),
});
const groupSchema = z.object({
  groupId: z.string(),
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  direction: z.enum(["rtl", "ltr"]),
  words: z.array(wordSchema),
  locked: z.boolean().optional(),
});

const patchSchema = z.object({
  move: z.enum(["up", "down"]).optional(),
  // caption group edits (source of truth) — editing marks the preview stale
  captionGroups: z.array(groupSchema).optional(),
  // approval workflow transitions
  status: z.enum(["DRAFT", "APPROVED", "REQUIRES_CHANGES"]).optional(),
  // content edits
  text: z.string().optional(),
  durationSec: z.number().min(0.5).max(120).optional(),
});

// Reorders a scene, edits its caption groups, or transitions its approval
// status. Any content/caption edit invalidates a previously rendered preview.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const scene = await prisma.scene.findUnique({ where: { id } });
    if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.move) {
      const targetOrder = body.move === "up" ? scene.order - 1 : scene.order + 1;
      const other = await prisma.scene.findFirst({
        where: { projectId: scene.projectId, order: targetOrder },
      });
      if (!other) return NextResponse.json({ ok: true });
      await prisma.$transaction([
        prisma.scene.update({ where: { id: other.id }, data: { order: scene.order } }),
        prisma.scene.update({ where: { id: scene.id }, data: { order: targetOrder } }),
      ]);
      return NextResponse.json({ ok: true });
    }

    const data: Record<string, unknown> = {};
    let invalidatesPreview = false;
    if (body.captionGroups !== undefined) {
      data.captionGroups = JSON.parse(JSON.stringify(body.captionGroups));
      invalidatesPreview = true;
    }
    if (body.text !== undefined) {
      data.text = body.text;
      invalidatesPreview = true;
    }
    if (body.durationSec !== undefined) {
      data.durationSec = body.durationSec;
      invalidatesPreview = true;
    }
    if (body.status !== undefined) {
      data.status = body.status; // explicit approve/reject wins
    } else if (invalidatesPreview && (scene.status === "PREVIEW_READY" || scene.status === "APPROVED")) {
      // an edit after preview/approval means it must be reviewed again
      data.status = "REQUIRES_CHANGES";
    }

    const updated = await prisma.scene.update({ where: { id }, data });
    return NextResponse.json(updated);
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
    await prisma.scene.updateMany({
      where: { projectId: scene.projectId, order: { gt: scene.order } },
      data: { order: { decrement: 1 } },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
