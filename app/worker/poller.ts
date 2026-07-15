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
import { processNextRender } from "../src/lib/render";
import { processNextProject, processNextScenePreview } from "../src/lib/project-render";
import { extractArticle } from "../src/lib/article";

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
      select: { id: true, guid: true },
    });
    const known = new Set(existing.map((e) => e.guid));
    const fresh = result.items.filter((i) => !known.has(i.guid));

    // Backfill: make sure every already-known item has its feed media rows
    // (items ingested before media capture existed, or feeds that add media later).
    if (existing.length > 0) {
      const idByExistingGuid = new Map(existing.map((e) => [e.guid, e.id]));
      const backfillRows = result.items
        .filter((i) => known.has(i.guid))
        .flatMap((i) => {
          const itemId = idByExistingGuid.get(i.guid);
          if (!itemId) return [];
          return i.media.map((m) => ({
            itemId,
            url: m.url,
            type: m.type,
            mimeType: m.mimeType,
            source: m.source,
          }));
        });
      if (backfillRows.length > 0) {
        await prisma.newsItemMedia.createMany({ data: backfillRows, skipDuplicates: true });
      }
    }

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

      // Attach every media file found in the fresh items.
      const created = await prisma.newsItem.findMany({
        where: { feedId: feed.id, guid: { in: fresh.map((i) => i.guid) } },
        select: { id: true, guid: true },
      });
      const idByGuid = new Map(created.map((c) => [c.guid, c.id]));
      const mediaRows = fresh.flatMap((i) => {
        const itemId = idByGuid.get(i.guid);
        if (!itemId) return [];
        return i.media.map((m) => ({
          itemId,
          url: m.url,
          type: m.type,
          mimeType: m.mimeType,
          source: m.source,
        }));
      });
      if (mediaRows.length > 0) {
        await prisma.newsItemMedia.createMany({ data: mediaRows, skipDuplicates: true });
      }
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
  let candidates;
  try {
    candidates = await prisma.feed.findMany({
      where: { enabled: true },
      select: { id: true, lastCheckedAt: true, errorCount: true },
    });
  } catch (err) {
    // DB unreachable (e.g. still starting up) — skip this tick and retry.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[poller] database not reachable, retrying next tick: ${message}`);
    return;
  }

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
setInterval(() => {
  tick().catch((err) => console.error("[poller] tick failed:", err));
}, TICK_MS);
tick().catch((err) => console.error("[poller] tick failed:", err));

// Article enrichment: visit each article page and pull the FULL story —
// complete text plus every image and video on the page — since RSS
// summaries usually carry only a fraction of it. Runs in the background
// over any item that hasn't been enriched yet (covers old items too).
const ENRICH_BATCH = 3;

async function enrichItem(item: { id: string; link: string; content: string }) {
  try {
    const article = await extractArticle(item.link);
    if (article) {
      if (article.images.length > 0 || article.videos.length > 0) {
        await prisma.newsItemMedia.createMany({
          data: [
            ...article.images.map((url) => ({
              itemId: item.id,
              url,
              type: "IMAGE" as const,
              mimeType: "",
              source: "article-html",
            })),
            ...article.videos.map((url) => ({
              itemId: item.id,
              url,
              type: "VIDEO" as const,
              mimeType: "",
              source: "article-html",
            })),
          ],
          skipDuplicates: true,
        });
      }
      // keep the fuller text; never downgrade to a shorter one
      const currentLength = item.content.replace(/<[^>]*>/g, "").length;
      const data: Record<string, unknown> = { enrichedAt: new Date() };
      if (article.text.length > currentLength) data.content = article.text;
      await prisma.newsItem.update({ where: { id: item.id }, data });
      console.log(
        `[enrich] ${item.id}: +${article.images.length} img, +${article.videos.length} vid, text ${article.text.length} chars`,
      );
    } else {
      await prisma.newsItem.update({
        where: { id: item.id },
        data: { enrichedAt: new Date() },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[enrich] ${item.id} failed: ${message}`);
    // mark attempted so one broken article doesn't block the queue
    await prisma.newsItem
      .update({ where: { id: item.id }, data: { enrichedAt: new Date() } })
      .catch(() => {});
  }
}

let enriching = false;
setInterval(async () => {
  if (enriching) return;
  enriching = true;
  try {
    const pending = await prisma.newsItem.findMany({
      where: { enrichedAt: null, NOT: { link: "" } },
      orderBy: { fetchedAt: "desc" },
      take: ENRICH_BATCH,
      select: { id: true, link: true, content: true },
    });
    await Promise.all(pending.map(enrichItem));
  } catch (err) {
    console.error("[enrich] queue error:", err);
  } finally {
    enriching = false;
  }
}, 5000);

// Video render queue: drain serially, checking every 3s when idle.
let rendering = false;
setInterval(async () => {
  if (rendering) return;
  rendering = true;
  try {
    while (await processNextRender(prisma)) {
      /* keep draining */
    }
  } catch (err) {
    console.error("[render] queue error:", err);
  } finally {
    rendering = false;
  }
}, 3000);

// Article→Video project queue.
let projecting = false;
setInterval(async () => {
  if (projecting) return;
  projecting = true;
  try {
    while (await processNextProject(prisma)) {
      /* keep draining */
    }
  } catch (err) {
    console.error("[project] queue error:", err);
  } finally {
    projecting = false;
  }
}, 4000);

// Per-scene preview render queue (independent scene proxies for review).
let previewing = false;
setInterval(async () => {
  if (previewing) return;
  previewing = true;
  try {
    while (await processNextScenePreview(prisma)) {
      /* keep draining */
    }
  } catch (err) {
    console.error("[scene-preview] queue error:", err);
  } finally {
    previewing = false;
  }
}, 3000);
