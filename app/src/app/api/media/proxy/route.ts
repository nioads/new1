import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_BYTES = 30 * 1024 * 1024;
const ALLOWED = /^(image|video|audio)\//;

function isPrivateHost(hostname: string): boolean {
  if (process.env.ALLOW_PRIVATE_MEDIA === "true") return false;
  if (hostname === "localhost" || hostname === "::1") return true;
  return (
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^0\./.test(hostname)
  );
}

// Same-origin proxy for remote feed media so canvas export isn't tainted
// by CORS and mixed-content images still load.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const url = req.nextUrl.searchParams.get("url") ?? "";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  if (!/^https?:$/.test(parsed.protocol) || isPrivateHost(parsed.hostname)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
  }

  try {
    const upstream = await fetch(parsed, {
      headers: { "user-agent": "NewsStudio/1.0 (+media-proxy)" },
      signal: AbortSignal.timeout(20000),
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `Upstream HTTP ${upstream.status}` },
        { status: 502 },
      );
    }
    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    if (!ALLOWED.test(contentType)) {
      return NextResponse.json({ error: "Not a media file" }, { status: 415 });
    }
    const length = Number(upstream.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }
    return new Response(upstream.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }
}
