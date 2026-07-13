import Parser from "rss-parser";

export type MediaKind = "IMAGE" | "VIDEO" | "AUDIO";

export type ParsedMedia = {
  url: string;
  type: MediaKind;
  mimeType: string;
  source: string; // enclosure | media:content | media:thumbnail | content-html
};

export type ParsedFeedItem = {
  guid: string;
  link: string;
  title: string;
  summary: string;
  content: string;
  author: string;
  imageUrl: string;
  publishedAt: Date;
  media: ParsedMedia[];
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
  // custom keepArray mapping returns raw XML nodes with attributes under $
  enclosures?: Array<{ url?: string; type?: string; $?: { url?: string; type?: string } }>;
  mediaContent?: Array<{ $?: { url?: string; medium?: string; type?: string } }>;
  mediaThumbnail?: Array<{ $?: { url?: string } }>;
};

const parser = new Parser<{ link?: string }, RawItem>({
  timeout: 20000,
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["enclosure", "enclosures", { keepArray: true }],
    ],
  },
});

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|m3u8)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|opus|wav|flac)(\?|#|$)/i;

function classify(url: string, mimeType?: string, medium?: string): MediaKind | null {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.startsWith("image")) return "IMAGE";
  if (mime.startsWith("video")) return "VIDEO";
  if (mime.startsWith("audio")) return "AUDIO";
  if (medium === "image") return "IMAGE";
  if (medium === "video") return "VIDEO";
  if (medium === "audio") return "AUDIO";
  if (IMAGE_EXT.test(url)) return "IMAGE";
  if (VIDEO_EXT.test(url)) return "VIDEO";
  if (AUDIO_EXT.test(url)) return "AUDIO";
  return null;
}

// Collects every media file referenced by an item: all enclosures, all
// media:content entries, media:thumbnail, and images embedded in the HTML.
function extractMedia(item: RawItem): ParsedMedia[] {
  const seen = new Map<string, ParsedMedia>();
  const add = (
    url: string | undefined,
    source: string,
    mimeType?: string,
    medium?: string,
    fallback?: MediaKind,
  ) => {
    if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) return;
    const type = classify(url, mimeType, medium) ?? fallback;
    if (!type) return;
    seen.set(url, { url, type, mimeType: mimeType ?? "", source });
  };

  for (const enc of item.enclosures ?? (item.enclosure ? [item.enclosure] : [])) {
    add(enc?.url ?? enc?.$?.url, "enclosure", enc?.type ?? enc?.$?.type);
  }
  for (const m of item.mediaContent ?? []) {
    // media:content without an explicit type is usually an image in news feeds
    add(m.$?.url, "media:content", m.$?.type, m.$?.medium, "IMAGE");
  }
  for (const t of item.mediaThumbnail ?? []) {
    add(t.$?.url, "media:thumbnail", undefined, undefined, "IMAGE");
  }
  const html = item["content:encoded"] ?? item.content ?? "";
  for (const match of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    add(match[1], "content-html", undefined, undefined, "IMAGE");
  }
  for (const match of html.matchAll(/<(?:video|source|audio)[^>]+src=["']([^"']+)["']/gi)) {
    add(match[1], "content-html");
  }
  return [...seen.values()];
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
      const media = extractMedia(item);
      const firstImage = media.find((m) => m.type === "IMAGE");
      return {
        guid,
        link: item.link ?? "",
        title: item.title?.trim() || "(untitled)",
        summary: (item.contentSnippet ?? stripHtml(contentHtml)).slice(0, 1000),
        content: contentHtml,
        author: item.creator ?? item.author ?? "",
        imageUrl: firstImage?.url ?? "",
        publishedAt: new Date(item.isoDate ?? item.pubDate ?? Date.now()),
        media,
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
