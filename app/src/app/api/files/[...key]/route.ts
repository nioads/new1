import { NextRequest } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { auth } from "@/lib/auth";
import { mediaDir } from "@/lib/storage";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
};

// Serves files written by the local storage driver.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { key } = await params;
  const rel = key.join("/");
  const base = mediaDir();
  const filePath = path.resolve(base, rel);
  if (!filePath.startsWith(base + path.sep)) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const info = await stat(filePath);
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
    return new Response(stream, {
      headers: {
        "Content-Type": MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
        "Content-Length": String(info.size),
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
