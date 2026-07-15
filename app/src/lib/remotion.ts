// Remotion render module — turns a Canonical Caption JSON into a transparent
// (alpha) webm that ffmpeg overlays onto the assembled video. Heavy (headless
// Chromium, per-frame render), so callers must treat failures as non-fatal and
// fall back to libass. The bundle is built once per process and cached.
import path from "path";
import os from "os";
import { existsSync } from "fs";
import type { CaptionDocument } from "./captions";

// Candidate system-chromium locations (Alpine names it differently across
// versions). Remotion's bundled headless shell is glibc-only, so on musl we
// must use a system browser.
const BROWSER_CANDIDATES = [
  process.env.REMOTION_BROWSER_EXECUTABLE,
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
].filter(Boolean) as string[];

let bundleCache: string | null = null;
let browserEnsured = false;

// Where the Remotion entry lives relative to the app root. Present in the
// container (source is shipped) — worker runs via tsx over the same tree.
function entryPoint(): string {
  return path.join(process.cwd(), "remotion", "index.ts");
}

async function getBundle(): Promise<string> {
  if (bundleCache) return bundleCache;
  const { bundle } = await import("@remotion/bundler");
  bundleCache = await bundle({
    entryPoint: entryPoint(),
    // Serve the bundled fonts (remotion/public) at the site root so
    // staticFile('fonts/…') resolves; keeps Arabic shaping working anywhere.
    publicDir: path.join(process.cwd(), "remotion", "public"),
  });
  return bundleCache;
}

async function ensureBrowser(): Promise<string | undefined> {
  const found = BROWSER_CANDIDATES.find((p) => existsSync(p));
  if (found) return found;
  if (browserEnsured) return undefined;
  try {
    // No system browser — let Remotion fetch its own (works on glibc distros).
    const { ensureBrowser: ensure } = await import("@remotion/renderer");
    await ensure();
    browserEnsured = true;
  } catch {
    // fall through — renderMedia will try to locate a browser itself
  }
  return undefined;
}

// Renders the caption overlay to a transparent webm at outPath. Returns true on
// success, false on any failure (so the caller falls back to libass).
export async function renderCaptionOverlay(
  doc: CaptionDocument,
  outPath: string,
): Promise<boolean> {
  if (doc.cues.length === 0) return false;
  try {
    const { selectComposition, renderMedia } = await import("@remotion/renderer");
    const browserExecutable = await ensureBrowser();
    const serveUrl = await getBundle();
    const inputProps = { doc };
    const composition = await selectComposition({
      serveUrl,
      id: "captions",
      inputProps,
      browserExecutable,
    });
    await renderMedia({
      composition,
      serveUrl,
      codec: "vp8", // webm; supports alpha
      pixelFormat: "yuva420p",
      imageFormat: "png",
      outputLocation: outPath,
      inputProps,
      browserExecutable,
      concurrency: Math.max(1, Math.min(4, (os.cpus?.().length ?? 2) - 1)),
      chromiumOptions: { gl: "swangle" },
      timeoutInMilliseconds: 60_000,
    });
    return true;
  } catch (err) {
    console.error(
      `[remotion] caption render failed, falling back to libass: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return false;
  }
}
