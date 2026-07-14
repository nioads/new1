import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { generateScript } from "@/lib/ai";

const schema = z.object({
  prompt: z.string().min(10).max(6000),
  sceneCount: z.number().int().min(2).max(120).default(6),
});

// Generates the narration script and scene breakdown from the article.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const body = schema.parse(await req.json());
    const project = await prisma.videoProject.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const item = await prisma.newsItem.findUnique({
      where: { id: project.itemId },
      include: { media: true },
    });
    if (!item) return NextResponse.json({ error: "Article not found" }, { status: 404 });

    const settings = await getSettings(prisma);
    const generated = await generateScript(
      settings,
      { title: item.title, content: item.content || item.summary },
      { prompt: body.prompt, sceneCount: body.sceneCount },
    );

    // replace scenes; pre-assign article images round-robin as starting visuals
    const articleImages = item.media.filter((m) => m.type === "IMAGE");
    await prisma.scene.deleteMany({ where: { projectId: id } });
    await prisma.scene.createMany({
      data: generated.scenes.map((scene, i) => ({
        projectId: id,
        order: i,
        text: scene.text,
        imageQuery: scene.imageQuery ?? "",
        imageUrl: articleImages.length > 0 ? articleImages[i % articleImages.length].url : "",
      })),
    });
    const updated = await prisma.videoProject.update({
      where: { id },
      data: { script: generated.script, scriptPrompt: body.prompt, status: "DRAFT", error: "" },
      include: { scenes: { orderBy: { order: "asc" } } },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return jsonError(err);
  }
}
