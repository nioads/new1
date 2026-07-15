// Generates and persists caption groups for a scene. Word timings come from
// Whisper/TTS (scene.words) when available, otherwise are estimated from the
// scene text and duration. Grouping is heuristic by default, or LLM-driven
// (semantic) when requested and available. Locked groups are preserved.
import type { PrismaClient } from "../generated/prisma/client";
import { getSettings } from "./settings";
import { aiGroupCaptions } from "./ai";
import {
  BUILTIN_CAPTION_STYLES,
  estimateWords,
  groupWords,
  groupWordsByCounts,
  type CaptionGroup,
  type CaptionStyleSpec,
  type CaptionWord,
} from "./captions";

async function styleFor(prisma: PrismaClient, styleId: string | null): Promise<CaptionStyleSpec> {
  if (styleId) {
    const s = await prisma.captionStyle.findUnique({ where: { id: styleId } });
    if (s) return s.style as unknown as CaptionStyleSpec;
  }
  return BUILTIN_CAPTION_STYLES[0].style;
}

export async function generateSceneGroups(
  prisma: PrismaClient,
  sceneId: string,
  opts?: { mode?: "heuristic" | "ai" },
): Promise<CaptionGroup[]> {
  const scene = await prisma.scene.findUnique({ where: { id: sceneId }, include: { project: true } });
  if (!scene) throw new Error("Scene not found");
  const spec = await styleFor(prisma, scene.project.captionStyleId);

  const words: CaptionWord[] =
    (scene.words as CaptionWord[] | null) ??
    estimateWords(scene.text, Math.max(1, (scene.ttsDuration || scene.durationSec) - 0.6));
  if (words.length === 0) {
    await prisma.scene.update({ where: { id: sceneId }, data: { captionGroups: [] } });
    return [];
  }

  // Preserve locked groups: only regroup the words not covered by a lock.
  const existing = (scene.captionGroups as CaptionGroup[] | null) ?? [];
  const locked = existing.filter((g) => g.locked);

  let groups: CaptionGroup[];
  const mode = opts?.mode ?? "heuristic";
  if (mode === "ai") {
    const settings = await getSettings(prisma);
    const counts = await aiGroupCaptions(settings, words.map((w) => w.w), {
      minWords: spec.minWords ?? 2,
      maxWords: spec.maxWords ?? 5,
    });
    groups = counts ? groupWordsByCounts(words, counts, spec) : groupWords(words, spec);
  } else {
    groups = groupWords(words, spec);
  }

  // Re-apply locks over any group whose text matches a locked phrase verbatim.
  if (locked.length) {
    const lockedTexts = new Set(locked.map((g) => g.text));
    groups = groups.map((g) => (lockedTexts.has(g.text) ? { ...g, locked: true } : g));
  }

  await prisma.scene.update({
    where: { id: sceneId },
    data: { captionGroups: JSON.parse(JSON.stringify(groups)) },
  });
  return groups;
}
