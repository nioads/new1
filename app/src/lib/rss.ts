import Parser from "rss-parser";

export type ParsedFeedItem = {
  guid: string;
  link: string;
  title: string;
  summary: string;
  content: string;
  author: string;
  imageUrl: string;
  publishedAt: Date;
};

export type FetchFeedResult =
  | { status: "not_modified" }
  | {
      status: "ok";
      title: string;
      siteUrl: string;
      etag: string;
      lastModified: string;
      items: ParsedFeedItem[];
    };

type RawItem = {
  guid?: string;
  link?: string;
  title?: string;
  contentSnippet?: string;
  content?: string;
  "content:encoded"?: string;
  creator?: string;
  author?: string;
  isoDate?: string;
  pubDate?: string;
  enclosure?: { url?: string; type?: string };
  mediaContent?: Array<{ $?: { url?: string; medium?: string; type?: string } }>;
  mediaThumbnail?: Array<{ $?: { url?: string } }>;
};

const parser = new Parser<{ link?: string }, RawItem>({
  timeout: 20000,
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
    ],
  },
});

function firstImage(item: RawItem): string {
  if (item.enclosure?.url && (item.enclosure.type ?? "").startsWith("image")) {
    return item.enclosure.url;
  }
  for (const m of item.mediaContent ?? []) {
    const url = m.$?.url;
    const isImage =
      m.$?.medium === "image" || (m.$?.type ?? "").startsWith("image") || !m.$?.type;
    if (url && isImage) return url;
  }
  const thumb = item.mediaThumbnail?.[0]?.$?.url;
  if (thumb) return thumb;
  const html = item["content:encoded"] ?? item.content ?? "";
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ?? "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchFeed(
  url: string,
  cache?: { etag?: string; lastModified?: string },
): Promise<FetchFeedResult> {
  const headers: Record<string, string> = {
    "user-agent": "NewsStudio/1.0 (+rss-inbox)",
    accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
  };
  if (cache?.etag) headers["if-none-match"] = cache.etag;
  if (cache?.lastModified) headers["if-modified-since"] = cache.lastModified;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (res.status === 304) return { status: "not_modified" };
  if (!res.ok) throw new Error(`HTTP ${res.status} from feed`);

  const xml = await res.text();
  const feed = await parser.parseString(xml);

  const items: ParsedFeedItem[] = (feed.items ?? [])
    .map((item) => {
      const guid = item.guid || item.link || item.title || "";
      if (!guid) return null;
      const contentHtml = item["content:encoded"] ?? item.content ?? "";
      return {
        guid,
        link: item.link ?? "",
        title: item.title?.trim() || "(untitled)",
        summary: (item.contentSnippet ?? stripHtml(contentHtml)).slice(0, 1000),
        content: contentHtml,
        author: item.creator ?? item.author ?? "",
        imageUrl: firstImage(item),
        publishedAt: new Date(item.isoDate ?? item.pubDate ?? Date.now()),
      };
    })
    .filter((i): i is ParsedFeedItem => i !== null);

  return {
    status: "ok",
    title: feed.title ?? "",
    siteUrl: feed.link ?? "",
    etag: res.headers.get("etag") ?? "",
    lastModified: res.headers.get("last-modified") ?? "",
    items,
  };
}
