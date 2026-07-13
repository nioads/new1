import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const sp = req.nextUrl.searchParams;
    const categoryId = sp.get("category") ?? undefined;
    const feedId = sp.get("feed") ?? undefined;
    const unreadOnly = sp.get("unread") === "1";
    const q = sp.get("q")?.trim();
    const cursor = sp.get("cursor") ?? undefined;
    const limit = Math.min(Number(sp.get("limit") ?? 50), 100);

    const where: Prisma.NewsItemWhereInput = {
      ...(categoryId ? { categoryId } : {}),
      ...(feedId ? { feedId } : {}),
      ...(unreadOnly ? { readAt: null } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { summary: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, unreadCount] = await Promise.all([
      prisma.newsItem.findMany({
        where,
        include: {
          feed: { select: { id: true, title: true, url: true } },
          category: { select: { id: true, name: true, color: true } },
          media: true,
        },
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.newsItem.count({ where: { readAt: null } }),
    ]);

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return NextResponse.json({
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
      unreadCount,
    });
  } catch (err) {
    return jsonError(err);
  }
}
