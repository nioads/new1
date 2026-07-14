import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export async function GET() {
  try {
    await requireSession();
    const styles = await prisma.captionStyle.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json(styles);
  } catch (err) {
    return jsonError(err);
  }
}

const styleSchema = z.object({
  fontSize: z.number().min(16).max(160),
  baseColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  activeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  outlineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  outlineWidth: z.number().min(0).max(12),
  bold: z.boolean(),
  uppercase: z.boolean(),
  wordsPerGroup: z.number().int().min(1).max(12),
  position: z.enum(["bottom", "middle", "top"]),
});

const createSchema = z.object({ name: z.string().min(1).max(60), style: styleSchema });

export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const body = createSchema.parse(await req.json());
    const style = await prisma.captionStyle.create({
      data: { name: body.name.trim(), style: body.style },
    });
    return NextResponse.json(style, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
