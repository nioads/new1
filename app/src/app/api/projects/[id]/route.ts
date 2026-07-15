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
    const project = await prisma.videoProject.findUnique({
      where: { id },
      include: { scenes: { orderBy: { order: "asc" } } },
    });
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const item = await prisma.newsItem.findUnique({
      where: { id: project.itemId },
      include: { media: true, feed: { select: { title: true } } },
    });
    return NextResponse.json({ ...project, item });
  } catch (err) {
    return jsonError(err);
  }
}

const sceneSchema = z.object({
  id: z.string(),
  text: z.string().optional(),
  imageUrl: z.string().optional(),
  imageQuery: z.string().optional(),
  imagePrompt: z.string().optional(),
  kenburns: z.string().optional(),
  transition: z.string().optional(),
  voiceId: z.string().optional(),
  durationSec: z.number().min(1).max(60).optional(),
  fit: z.enum(["cover", "blur", "contain"]).optional(),
  focusX: z.number().min(0).max(1).optional(),
  focusY: z.number().min(0).max(1).optional(),
  zoom: z.number().min(1).max(3).optional(),
});

const patchSchema = z.object({
  script: z.string().optional(),
  scriptPrompt: z.string().optional(),
  musicTrackId: z.string().nullable().optional(),
  voiceId: z.string().optional(),
  captionsEnabled: z.boolean().optional(),
  captionStyleId: z.string().nullable().optional(),
  captionRenderer: z.enum(["", "remotion", "libass"]).optional(),
  aspect: z.enum(["16:9", "9:16"]).optional(),
  brandId: z.string().nullable().optional(),
  targetSeconds: z.number().int().min(10).max(1800).optional(),
  scriptModel: z.string().optional(),
  scriptLang: z.string().max(8).optional(),
  visualMode: z.enum(["search", "ai"]).optional(),
  scenes: z.array(sceneSchema).optional(),
  queueRender: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const data: Record<string, unknown> = {};
    if (body.script !== undefined) data.script = body.script;
    if (body.scriptPrompt !== undefined) data.scriptPrompt = body.scriptPrompt;
    if (body.musicTrackId !== undefined) data.musicTrackId = body.musicTrackId;
    if (body.voiceId !== undefined) data.voiceId = body.voiceId;
    if (body.targetSeconds !== undefined) data.targetSeconds = body.targetSeconds;
    if (body.scriptModel !== undefined) data.scriptModel = body.scriptModel;
    if (body.scriptLang !== undefined) data.scriptLang = body.scriptLang;
    if (body.visualMode !== undefined) data.visualMode = body.visualMode;
    if (body.captionsEnabled !== undefined) data.captionsEnabled = body.captionsEnabled;
    if (body.captionStyleId !== undefined) data.captionStyleId = body.captionStyleId;
    if (body.captionRenderer !== undefined) data.captionRenderer = body.captionRenderer;
    if (body.brandId !== undefined) data.brandId = body.brandId;
    if (body.aspect !== undefined) {
      data.aspect = body.aspect;
      data.width = body.aspect === "9:16" ? 1080 : 1920;
      data.height = body.aspect === "9:16" ? 1920 : 1080;
    }
    if (body.queueRender) {
      data.status = "QUEUED";
      data.error = "";
    }
    await prisma.videoProject.update({ where: { id }, data });

    for (const scene of body.scenes ?? []) {
      const { id: sceneId, ...fields } = scene;
      await prisma.scene.updateMany({
        where: { id: sceneId, projectId: id },
        data: fields,
      });
    }

    const project = await prisma.videoProject.findUnique({
      where: { id },
      include: { scenes: { orderBy: { order: "asc" } } },
    });
    return NextResponse.json(project);
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
    await prisma.videoProject.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
