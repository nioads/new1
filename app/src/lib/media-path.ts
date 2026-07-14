import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { mediaDir } from "./storage";

// Resolves a media reference (local /api/files/... URL or remote http URL)
// to a real filesystem path the renderer can read. Remote files are
// downloaded into a temp dir; the returned flag says whether to clean up.
export async function resolveToLocalFile(
  urlOrPath: string,
  tmpSubdir = "render-tmp",
): Promise<{ path: string; temp: boolean }> {
  if (urlOrPath.startsWith("/api/files/")) {
    return { path: path.join(mediaDir(), urlOrPath.slice("/api/files/".length)), temp: false };
  }
  if (!/^https?:\/\//i.test(urlOrPath)) {
    return { path: urlOrPath, temp: false }; // already a filesystem path
  }
  const res = await fetch(urlOrPath, {
    headers: { "user-agent": "NewsStudio/1.0 (+renderer)" },
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`Download failed HTTP ${res.status}: ${urlOrPath.slice(0, 120)}`);
  const ext = path.extname(new URL(urlOrPath).pathname).slice(0, 8) || ".bin";
  const filePath = path.join(mediaDir(), tmpSubdir, `${crypto.randomBytes(8).toString("hex")}${ext}`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(await res.arrayBuffer()));
  return { path: filePath, temp: true };
}
