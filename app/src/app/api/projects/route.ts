import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { defaultScriptPrompt } from "@/lib/ai";

export async function GET() {
  try {
    await requireSession();
    const projects = await prisma.videoProject.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { scenes: true } } },
      take: 50,
    });
    return NextResponse.json(projects);
  } catch (err) {
    return jsonError(err);
  }
}

const createSchema = z.object({
  itemId: z.string(),
  aspect: z.enum(["16:9", "9:16"]).default("16:9"),
  brandId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const body = createSchema.parse(await req.json());
    const item = await prisma.newsItem.findUnique({
      where: { id: body.itemId },
      include: { feed: { select: { brandId: true } } },
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    const [width, height] = body.aspect === "9:16" ? [1080, 1920] : [1920, 1080];
    const project = await prisma.videoProject.create({
      data: {
        itemId: item.id,
        title: item.title.slice(0, 120),
        aspect: body.aspect,
        width,
        height,
        // default to the feed's brand so intro/outro/logo apply automatically
        brandId: body.brandId ?? item.feed.brandId ?? null,
        scriptPrompt: defaultScriptPrompt(body.aspect),
      },
    });
    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
