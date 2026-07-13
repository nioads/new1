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
    const template = await prisma.imageTemplate.findUnique({
      where: { id },
      include: {
        variants: true,
        brand: { select: { id: true, name: true, logoUrl: true, primaryColor: true } },
      },
    });
    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(template);
  } catch (err) {
    return jsonError(err);
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  brandId: z.string().nullable().optional(),
  variants: z
    .array(
      z.object({
        aspect: z.enum(["16:9", "9:16", "1:1"]),
        elements: z.array(z.record(z.string(), z.unknown())),
      }),
    )
    .optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    if (body.name !== undefined || body.brandId !== undefined) {
      await prisma.imageTemplate.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.brandId !== undefined ? { brandId: body.brandId || null } : {}),
        },
      });
    }
    for (const variant of body.variants ?? []) {
      await prisma.templateVariant.updateMany({
        where: { templateId: id, aspect: variant.aspect },
        data: { elements: JSON.parse(JSON.stringify(variant.elements)) },
      });
      // touch updatedAt
      await prisma.imageTemplate.update({ where: { id }, data: {} });
    }

    const template = await prisma.imageTemplate.findUnique({
      where: { id },
      include: {
        variants: true,
        brand: { select: { id: true, name: true, logoUrl: true, primaryColor: true } },
      },
    });
    return NextResponse.json(template);
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
    await prisma.imageTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
