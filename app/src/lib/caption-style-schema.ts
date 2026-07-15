import { z } from "zod";

// Validation for a caption style spec. Kept permissive/extensible: the core
// visual fields are required, everything added later (grouping rules, highlight,
// motion, box) is optional, and unknown keys pass through so the stored JSON can
// evolve without breaking older/newer clients.
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const captionStyleSchema = z
  .object({
    fontSize: z.number().min(16).max(200),
    baseColor: hex,
    activeColor: hex,
    outlineColor: hex,
    outlineWidth: z.number().min(0).max(20),
    bold: z.boolean(),
    position: z.enum(["top", "upper", "middle", "lower", "bottom"]),
    // legacy / optional typography
    uppercase: z.boolean().optional(),
    wordsPerGroup: z.number().int().min(1).max(12).optional(),
    maxWidthPercent: z.number().min(30).max(100).optional(),
    lineHeight: z.number().min(0.8).max(3).optional(),
    // grouping
    minWords: z.number().int().min(1).max(8).optional(),
    maxWords: z.number().int().min(1).max(12).optional(),
    targetWords: z.number().int().min(1).max(8).optional(),
    minDurationMs: z.number().min(100).max(8000).optional(),
    maxDurationMs: z.number().min(500).max(12000).optional(),
    targetDurationMs: z.number().min(500).max(12000).optional(),
    followVoicePauses: z.boolean().optional(),
    keepNumbersWithUnits: z.boolean().optional(),
    allowSingleWordEmphasisGroup: z.boolean().optional(),
    // active-word highlight
    highlightMode: z.enum(["color", "background", "pill", "underline"]).optional(),
    activeBg: hex.optional(),
    activeScale: z.number().min(1).max(2).optional(),
    transitionMs: z.number().min(0).max(1000).optional(),
    holdUntilNextWord: z.boolean().optional(),
    // background box
    boxBackground: z.enum(["none", "group", "active"]).optional(),
    boxColor: hex.optional(),
    boxOpacity: z.number().min(0).max(1).optional(),
    boxRadius: z.number().min(0).max(100).optional(),
    boxPadding: z.number().min(0).max(100).optional(),
    // motion
    groupEntrance: z.enum(["none", "fade", "pop"]).optional(),
    groupExit: z.enum(["none", "fade"]).optional(),
    reducedMotion: z.boolean().optional(),
  })
  .passthrough();

export type CaptionStyleInput = z.infer<typeof captionStyleSchema>;
