import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export async function GET() {
  try {
    await requireSession();
    const categories = await prisma.category.findMany({
      include: { _count: { select: { feeds: true, items: true } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(categories);
  } catch (err) {
    return jsonError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(60),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #ff0000")
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const body = createSchema.parse(await req.json());
    const category = await prisma.category.create({
      data: { name: body.name.trim(), color: body.color ?? "#6366f1" },
      include: { _count: { select: { feeds: true, items: true } } },
    });
    return NextResponse.json(category, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
