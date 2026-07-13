import { NextRequest, NextResponse } from "next/server";
import path from "path";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { renderTmpDir, writeDataUrl } from "@/lib/render";

const createSchema = z.object({
  itemId: z.string().optional(),
  templateId: z.string().optional(),
  brandId: z.string().optional(),
  aspect: z.enum(["16:9", "9:16", "1:1"]),
  width: z.number().int().min(240).max(4096),
  height: z.number().int().min(240).max(4096),
  duration: z.number().min(1).max(5),
  fps: z.number().int().min(15).max(30).default(25),
  backgroundKind: z.enum(["image", "video"]),
  backgroundDataUrl: z.string().startsWith("data:").optional(),
  backgroundUrl: z.string().url().optional(),
  overlayDataUrl: z.string().startsWith("data:"),
  kenburns: z.enum(["in", "out", "left", "right", "none"]).default("in"),
  textAnim: z.enum(["fade", "slideup", "none"]).default("slideup"),
});

export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const body = createSchema.parse(await req.json());
    if (!body.backgroundDataUrl && !body.backgroundUrl) {
      return NextResponse.json({ error: "A background is required" }, { status: 400 });
    }

    const stamp = crypto.randomBytes(6).toString("hex");
    const overlayPath = path.join(renderTmpDir(), `${stamp}-overlay.png`);
    await writeDataUrl(body.overlayDataUrl, overlayPath);

    let bgPath: string | undefined;
    if (body.backgroundDataUrl) {
      const ext = body.backgroundKind === "video" ? "mp4" : "png";
      bgPath = path.join(renderTmpDir(), `${stamp}-bg.${ext}`);
      await writeDataUrl(body.backgroundDataUrl, bgPath);
    }

    const render = await prisma.videoRender.create({
      data: {
        aspect: body.aspect,
        itemId: body.itemId ?? null,
        templateId: body.templateId ?? null,
        brandId: body.brandId ?? null,
        params: {
          width: body.width,
          height: body.height,
          duration: body.duration,
          fps: body.fps,
          background: { kind: body.backgroundKind, path: bgPath, url: body.backgroundUrl },
          overlayPath,
          kenburns: body.kenburns,
          textAnim: body.textAnim,
        },
      },
    });
    return NextResponse.json(render, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const itemId = req.nextUrl.searchParams.get("item") || undefined;
    const renders = await prisma.videoRender.findMany({
      where: itemId ? { itemId } : {},
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        aspect: true,
        outputUrl: true,
        error: true,
        createdAt: true,
      },
    });
    return NextResponse.json(renders);
  } catch (err) {
    return jsonError(err);
  }
}
