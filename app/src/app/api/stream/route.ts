import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Server-Sent Events stream: pushes newly fetched items to the browser.
// The worker writes items to Postgres; this endpoint polls for rows newer
// than its cursor every few seconds and forwards them as `items` events.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let cursor = new Date();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send("hello", { ts: cursor.toISOString() });

      const interval = setInterval(async () => {
        if (closed) return;
        try {
          const fresh = await prisma.newsItem.findMany({
            where: { fetchedAt: { gt: cursor } },
            include: {
              feed: { select: { id: true, title: true } },
              category: { select: { id: true, name: true, color: true } },
            },
            orderBy: { fetchedAt: "asc" },
            take: 50,
          });
          if (fresh.length > 0) {
            cursor = fresh[fresh.length - 1].fetchedAt;
            const unreadCount = await prisma.newsItem.count({ where: { readAt: null } });
            send("items", { items: fresh, unreadCount });
          } else {
            send("ping", {});
          }
        } catch {
          // transient DB error — keep the stream alive and retry next tick
        }
      }, 4000);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
