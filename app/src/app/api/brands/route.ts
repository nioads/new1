import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export async function GET() {
  try {
    await requireSession();
    const brands = await prisma.brand.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json(brands);
  } catch (err) {
    return jsonError(err);
  }
}

const createSchema = z.object({ name: z.string().min(1).max(80) });

export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const body = createSchema.parse(await req.json());
    const brand = await prisma.brand.create({ data: { name: body.name.trim() } });
    return NextResponse.json(brand, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
