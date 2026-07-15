import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { captionStyleSchema } from "@/lib/caption-style-schema";

export async function GET() {
  try {
    await requireSession();
    const styles = await prisma.captionStyle.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json(styles);
  } catch (err) {
    return jsonError(err);
  }
}

const createSchema = z.object({ name: z.string().min(1).max(60), style: captionStyleSchema });

export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const body = createSchema.parse(await req.json());
    const style = await prisma.captionStyle.create({
      data: { name: body.name.trim(), style: JSON.parse(JSON.stringify(body.style)) },
    });
    return NextResponse.json(style, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
