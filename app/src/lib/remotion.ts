// Remotion render module — turns a Canonical Caption JSON into a transparent
// (alpha) webm that ffmpeg overlays onto the assembled video. Heavy (headless
// Chromium, per-frame render), so callers must treat failures as non-fatal and
// fall back to libass. The bundle is built once per process and cached.
import path from "path";
import os from "os";
import { existsSync } from "fs";
import { flattenGroups, type CaptionDocument } from "./captions";

// On our Debian image Remotion manages its own (glibc) headless Chromium, so
// no system browser is needed. These candidates only let an operator point at
// a preinstalled browser via REMOTION_BROWSER_EXECUTABLE or a distro package;
// when none exist we fall back to Remotion's managed browser.
const BROWSER_CANDIDATES = [
  process.env.REMOTION_BROWSER_EXECUTABLE,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
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
  if (flattenGroups(doc).length === 0) return false;
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
    // ProRes 4444 (.mov) — the reliable alpha-preserving codec. VP8/VP9 webm
    // dropped the alpha channel (encoded yuv420p → opaque), which made the
    // overlay hide the video underneath. ProRes 4444 keeps a true alpha channel
    // (yuva444p10le) so the captions composite transparently over the scene.
    await renderMedia({
      composition,
      serveUrl,
      codec: "prores",
      proResProfile: "4444",
      pixelFormat: "yuva444p10le",
      imageFormat: "png",
      outputLocation: outPath,
      inputProps,
      browserExecutable,
      concurrency: Math.max(1, Math.min(4, (os.cpus?.().length ?? 2) - 1)),
      chromiumOptions: { gl: "swangle" },
      timeoutInMilliseconds: 120_000,
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
