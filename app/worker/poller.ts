// Feed polling worker.
// Each enabled feed is checked every POLL_INTERVAL_MS (default 30s), staggered:
// a scheduler tick runs every TICK_MS and picks up feeds whose lastCheckedAt is
// older than the interval, processing up to CONCURRENCY at once. Conditional
// GETs (ETag / Last-Modified) keep origin load minimal at ~100 feeds.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { fetchFeed } from "../src/lib/rss";
import { broadcastPush } from "../src/lib/push";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 30_000);
const TICK_MS = 5_000;
const CONCURRENCY = 10;
// Feeds that keep failing get backed off: interval * min(errorCount, MAX_BACKOFF_FACTOR)
const MAX_BACKOFF_FACTOR = 20;

const inFlight = new Set<string>();

async function pollFeed(feedId: string) {
  const feed = await prisma.feed.findUnique({
    where: { id: feedId },
    include: { category: true },
  });
  if (!feed || !feed.enabled) return;

  try {
    const result = await fetchFeed(feed.url, {
      etag: feed.etag || undefined,
      lastModified: feed.lastModified || undefined,
    });

    if (result.status === "not_modified") {
      await prisma.feed.update({
        where: { id: feed.id },
        data: { lastCheckedAt: new Date(), lastError: "", errorCount: 0 },
      });
      return;
    }

    const existing = await prisma.newsItem.findMany({
      where: { feedId: feed.id, guid: { in: result.items.map((i) => i.guid) } },
      select: { guid: true },
    });
    const known = new Set(existing.map((e) => e.guid));
    const fresh = result.items.filter((i) => !known.has(i.guid));

    if (fresh.length > 0) {
      await prisma.newsItem.createMany({
        data: fresh.map((i) => ({
          feedId: feed.id,
          categoryId: feed.categoryId,
          guid: i.guid,
          link: i.link,
          title: i.title,
          summary: i.summary,
          content: i.content,
          author: i.author,
          imageUrl: i.imageUrl,
          publishedAt: i.publishedAt,
        })),
        skipDuplicates: true,
      });
      console.log(`[poller] ${feed.title || feed.url}: ${fresh.length} new item(s)`);

      if (!feed.muted && !feed.category.muted) {
        const first = fresh[0];
        await broadcastPush(prisma, {
          title:
            fresh.length === 1
              ? `${feed.title || "Feed"} — ${feed.category.name}`
              : `${feed.title || "Feed"}: ${fresh.length} new items`,
          body: first.title,
          url: "/",
          tag: `feed-${feed.id}`,
        });
      }
    }

    await prisma.feed.update({
      where: { id: feed.id },
      data: {
        title: feed.title || result.title,
        siteUrl: result.siteUrl,
        etag: result.etag,
        lastModified: result.lastModified,
        lastCheckedAt: new Date(),
        lastError: "",
        errorCount: 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[poller] ${feed.url} failed: ${message}`);
    await prisma.feed.update({
      where: { id: feed.id },
      data: {
        lastCheckedAt: new Date(),
        lastError: message.slice(0, 500),
        errorCount: { increment: 1 },
      },
    });
  }
}

async function tick() {
  const now = Date.now();
  const candidates = await prisma.feed.findMany({
    where: { enabled: true },
    select: { id: true, lastCheckedAt: true, errorCount: true },
  });

  const due = candidates.filter((f) => {
    if (inFlight.has(f.id)) return false;
    if (!f.lastCheckedAt) return true;
    const backoff = Math.min(Math.max(f.errorCount, 1), MAX_BACKOFF_FACTOR);
    return now - f.lastCheckedAt.getTime() >= POLL_INTERVAL_MS * backoff;
  });

  const slots = Math.max(0, CONCURRENCY - inFlight.size);
  for (const feed of due.slice(0, slots)) {
    inFlight.add(feed.id);
    pollFeed(feed.id)
      .catch((err) => console.error(`[poller] unexpected error:`, err))
      .finally(() => inFlight.delete(feed.id));
  }
}

console.log(
  `[poller] started — interval ${POLL_INTERVAL_MS}ms, tick ${TICK_MS}ms, concurrency ${CONCURRENCY}`,
);
setInterval(tick, TICK_MS);
tick();
