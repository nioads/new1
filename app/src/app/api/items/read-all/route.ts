import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export async function POST() {
  try {
    await requireSession();
    await prisma.newsItem.updateMany({
      where: { readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
