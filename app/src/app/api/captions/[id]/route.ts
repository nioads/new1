import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { captionStyleSchema } from "@/lib/caption-style-schema";

const patchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  style: captionStyleSchema.optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const style = await prisma.captionStyle.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name.trim() } : {}),
        ...(body.style ? { style: JSON.parse(JSON.stringify(body.style)) } : {}),
      },
    });
    return NextResponse.json(style);
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
    const style = await prisma.captionStyle.findUnique({ where: { id } });
    if (style?.builtin) {
      return NextResponse.json({ error: "Built-in styles cannot be deleted" }, { status: 409 });
    }
    await prisma.captionStyle.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
