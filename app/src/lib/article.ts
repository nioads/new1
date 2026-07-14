// Full-article extraction: fetches the article page itself and pulls the
// complete text plus every image/video referenced by it — RSS summaries
// often carry only a fraction of the story.
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";

export type ExtractedArticle = {
  title: string;
  text: string; // full plain text
  html: string; // readable article HTML
  images: string[];
  videos: string[];
};

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|m3u8)(\?|#|$)/i;

function absolutize(src: string | null | undefined, base: string): string | null {
  if (!src) return null;
  try {
    const url = new URL(src, base);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function looksLikeTracker(url: string): boolean {
  return (
    /1x1|pixel|spacer|blank|badge|button|icon|logo-|sprite/i.test(url) ||
    /\.(svg|ico)(\?|#|$)/i.test(url)
  );
}

export async function extractArticle(articleUrl: string): Promise<ExtractedArticle | null> {
  const res = await fetch(articleUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; NewsStudio/1.0; +article-reader) AppleWebKit/537.36",
      accept: "text/html,application/xhtml+xml,*/*",
    },
    signal: AbortSignal.timeout(25000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from article`);
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType && !/(text\/html|xhtml|octet-stream|text\/plain)/i.test(contentType)) {
    return null; // not an HTML page (pdf, image, …)
  }
  const html = await res.text();

  const virtualConsole = new VirtualConsole(); // swallow CSS/JS parse noise
  const dom = new JSDOM(html, { url: articleUrl, virtualConsole });
  const doc = dom.window.document;

  const images = new Set<string>();
  const videos = new Set<string>();

  // og/twitter meta media
  for (const sel of [
    'meta[property="og:image"]',
    'meta[property="og:image:url"]',
    'meta[name="twitter:image"]',
  ]) {
    for (const m of doc.querySelectorAll(sel)) {
      const url = absolutize(m.getAttribute("content"), articleUrl);
      if (url && !looksLikeTracker(url)) images.add(url);
    }
  }
  for (const sel of [
    'meta[property="og:video"]',
    'meta[property="og:video:url"]',
    'meta[property="og:video:secure_url"]',
    'meta[name="twitter:player:stream"]',
  ]) {
    for (const m of doc.querySelectorAll(sel)) {
      const url = absolutize(m.getAttribute("content"), articleUrl);
      if (url) videos.add(url);
    }
  }

  // videos anywhere on the page (before Readability prunes the DOM)
  for (const v of doc.querySelectorAll("video[src], video source[src]")) {
    const url = absolutize(v.getAttribute("src"), articleUrl);
    if (url) videos.add(url);
  }

  // readable article body
  const article = new Readability(doc, { keepClasses: false }).parse();

  // collect images from the extracted article body (highest quality signal);
  // fall back to the whole page when Readability finds nothing
  const scope = article?.content
    ? new JSDOM(article.content, { url: articleUrl, virtualConsole }).window.document
    : doc;
  for (const img of scope.querySelectorAll("img[src], img[data-src]")) {
    const url = absolutize(
      img.getAttribute("src") ?? img.getAttribute("data-src"),
      articleUrl,
    );
    if (url && !looksLikeTracker(url)) images.add(url);
    const srcset = img.getAttribute("srcset");
    if (srcset) {
      // take the largest candidate from srcset
      const last = srcset.split(",").pop()?.trim().split(/\s+/)[0];
      const lastUrl = absolutize(last, articleUrl);
      if (lastUrl && !looksLikeTracker(lastUrl)) images.add(lastUrl);
    }
  }
  for (const v of scope.querySelectorAll("video[src], video source[src]")) {
    const url = absolutize(v.getAttribute("src"), articleUrl);
    if (url) videos.add(url);
  }
  // direct media links inside the article
  for (const a of scope.querySelectorAll("a[href]")) {
    const url = absolutize(a.getAttribute("href"), articleUrl);
    if (!url) continue;
    if (VIDEO_EXT.test(url)) videos.add(url);
    else if (IMAGE_EXT.test(url) && !looksLikeTracker(url)) images.add(url);
  }

  const text = (article?.textContent ?? "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  return {
    title: article?.title ?? doc.title ?? "",
    text,
    html: article?.content ?? "",
    images: [...images],
    videos: [...videos],
  };
}
