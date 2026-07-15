import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { ASPECTS, defaultElements } from "@/lib/template-types";

export async function GET() {
  try {
    await requireSession();
    const templates = await prisma.imageTemplate.findMany({
      include: {
        variants: true,
        brand: { select: { id: true, name: true, logoUrl: true, primaryColor: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(templates);
  } catch (err) {
    return jsonError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  brandId: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const body = createSchema.parse(await req.json());
    const template = await prisma.imageTemplate.create({
      data: {
        name: body.name.trim(),
        brandId: body.brandId || null,
        variants: {
          create: ASPECTS.map((a) => ({
            aspect: a.aspect,
            width: a.width,
            height: a.height,
            elements: JSON.parse(JSON.stringify(defaultElements(a.aspect, a.width, a.height))),
          })),
        },
      },
      include: {
        variants: true,
        brand: { select: { id: true, name: true, logoUrl: true, primaryColor: true } },
      },
    });
    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
