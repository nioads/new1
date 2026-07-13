import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { fetchFeed } from "@/lib/rss";

export async function GET() {
  try {
    await requireSession();
    const feeds = await prisma.feed.findMany({
      include: {
        category: true,
        brand: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(feeds);
  } catch (err) {
    return jsonError(err);
  }
}

const createSchema = z.object({
  url: z.string().url("A valid feed URL is required"),
  categoryId: z.string().min(1, "Category is required"),
  brandId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const body = createSchema.parse(await req.json());

    const existing = await prisma.feed.findUnique({ where: { url: body.url } });
    if (existing) {
      return NextResponse.json({ error: "This feed is already added" }, { status: 409 });
    }

    // Validate the URL actually serves a parseable feed before saving.
    let title = "";
    let siteUrl = "";
    try {
      const result = await fetchFeed(body.url);
      if (result.status === "ok") {
        title = result.title;
        siteUrl = result.siteUrl;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "unreachable";
      return NextResponse.json(
        { error: `Could not read this feed: ${message}` },
        { status: 422 },
      );
    }

    const feed = await prisma.feed.create({
      data: {
        url: body.url,
        title,
        siteUrl,
        categoryId: body.categoryId,
        brandId: body.brandId || null,
      },
      include: { category: true, brand: true, _count: { select: { items: true } } },
    });
    return NextResponse.json(feed, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
