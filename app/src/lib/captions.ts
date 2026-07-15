// Caption pipeline.
//
// Model: a scene's word-level timings are divided into short, readable CAPTION
// GROUPS (2–5 words, semantic + timing aware). At playback exactly one group is
// on screen; the whole group stays visible while its words are spoken and only
// the currently-pronounced word is highlighted; the group disappears when its
// last word ends and the next group takes over.
//
// Hierarchy:  Video → Scene → Caption Group → Word
//
// The grouped model (Canonical Caption JSON) is the single source of truth fed
// to every renderer:
//   • Remotion  — premium progressive group + active-word render (headless Chrome)
//   • libass    — ffmpeg burned-in fallback (same groups/timings)
//   • SRT / VTT — one cue per group (accessibility / platform captions)

// ── Raw word timing (seconds, scene-relative) — from Whisper or estimation ──
export type CaptionWord = { w: string; s: number; e: number };

// ── Rich caption model (milliseconds) ───────────────────────────────────────
export type Direction = "rtl" | "ltr";

export type WordUnit = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  direction: Direction;
};

export type CaptionGroup = {
  groupId: string;
  text: string;
  startMs: number; // scene-relative
  endMs: number;
  direction: Direction;
  words: WordUnit[];
  locked?: boolean; // user locked this phrase against regrouping
};

export type SceneCaptionData = {
  sceneId: string;
  sceneStartMs: number; // scene-relative origin (0)
  sceneEndMs: number;
  language: "ar" | "en";
  baseDirection: Direction;
  fullTranscript: string;
  captionGroups: CaptionGroup[];
};

// ── Style / behavior spec ───────────────────────────────────────────────────
export type CaptionStyleSpec = {
  // typography
  fontSize: number; // relative to 1080p height
  baseColor: string;
  activeColor: string;
  outlineColor: string;
  outlineWidth: number;
  bold: boolean;
  uppercase: boolean;
  position: "top" | "upper" | "middle" | "lower" | "bottom";
  lineHeight?: number;
  maxWidthPercent?: number; // default 85
  maxLines?: number; // default 2
  // grouping
  minWords?: number; // default 2
  maxWords?: number; // default 5
  targetWords?: number; // preferred size, default 3
  minDurationMs?: number; // default 700
  maxDurationMs?: number; // default 4000
  targetDurationMs?: number; // default 3000
  followVoicePauses?: boolean; // default true
  keepNumbersWithUnits?: boolean; // default true
  allowSingleWordEmphasisGroup?: boolean; // default true
  // active-word highlight
  highlightMode?: "color" | "background" | "pill" | "underline"; // default background
  activeBg?: string; // default activeColor-derived
  activeScale?: number; // default 1.06
  transitionMs?: number; // default 140
  holdUntilNextWord?: boolean; // default true
  // group background box
  boxBackground?: "none" | "group" | "active"; // default none
  boxColor?: string;
  boxOpacity?: number;
  boxRadius?: number;
  boxPadding?: number;
  // motion
  groupEntrance?: "none" | "fade" | "pop"; // default pop
  groupExit?: "none" | "fade"; // default fade
  reducedMotion?: boolean;
  // legacy (still read if present)
  wordsPerGroup?: number;
};

export const BUILTIN_CAPTION_STYLES: Array<{ name: string; style: CaptionStyleSpec }> = [
  {
    name: "Hormozi",
    style: {
      fontSize: 64,
      baseColor: "#ffffff",
      activeColor: "#ffd900",
      outlineColor: "#000000",
      outlineWidth: 5,
      bold: true,
      uppercase: false,
      position: "middle",
      highlightMode: "background",
      activeBg: "#e11d48",
      activeScale: 1.08,
      targetWords: 3,
    },
  },
  {
    name: "Clean",
    style: {
      fontSize: 46,
      baseColor: "#ffffff",
      activeColor: "#38bdf8",
      outlineColor: "#000000",
      outlineWidth: 3,
      bold: true,
      uppercase: false,
      position: "lower",
      highlightMode: "color",
      activeScale: 1.05,
      targetWords: 4,
    },
  },
  {
    name: "Minimal",
    style: {
      fontSize: 36,
      baseColor: "#e2e8f0",
      activeColor: "#ffffff",
      outlineColor: "#0f172a",
      outlineWidth: 2,
      bold: false,
      uppercase: false,
      position: "bottom",
      highlightMode: "underline",
      activeScale: 1.0,
      targetWords: 4,
    },
  },
];

// Fills grouping-relevant defaults onto a (possibly partial) style spec.
export function resolveGrouping(spec: CaptionStyleSpec) {
  return {
    minWords: spec.minWords ?? 2,
    maxWords: spec.maxWords ?? Math.max(spec.minWords ?? 2, spec.wordsPerGroup ?? 5),
    targetWords: spec.targetWords ?? Math.min(3, spec.wordsPerGroup ?? 3),
    minDurationMs: spec.minDurationMs ?? 700,
    maxDurationMs: spec.maxDurationMs ?? 4000,
    targetDurationMs: spec.targetDurationMs ?? 3000,
    followVoicePauses: spec.followVoicePauses ?? true,
    keepNumbersWithUnits: spec.keepNumbersWithUnits ?? true,
    allowSingleWordEmphasisGroup: spec.allowSingleWordEmphasisGroup ?? true,
  };
}

// ── Script / direction detection ─────────────────────────────────────────────
const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const DIGIT_RE = /[0-9٠-٩۰-۹]/;

function arabicRatio(text: string): number {
  let ar = 0;
  let total = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    total++;
    if (ARABIC_RE.test(ch)) ar++;
  }
  return total > 0 ? ar / total : 0;
}

function wordDirection(text: string): Direction {
  // A word is RTL only if it actually contains Arabic letters; pure numbers,
  // Latin words, acronyms and units stay LTR so bidi runs isolate correctly.
  return ARABIC_RE.test(text) ? "rtl" : "ltr";
}

function baseDirection(text: string): Direction {
  return arabicRatio(text) > 0.3 ? "rtl" : "ltr";
}

// units/currency that should stay glued to an adjacent number
const UNIT_TOKENS = new Set([
  "%", "$", "€", "£", "M", "K", "B", "m", "km", "kg", "cm", "mm", "mph", "fps",
  "مليون", "ألف", "الف", "مليار", "متر", "كم", "كغ", "دقيقة", "ثانية", "ساعة", "بالمئة",
]);

function isNumeric(t: string): boolean {
  return DIGIT_RE.test(t) && /^[\d٠-٩۰-۹.,:/%\-–MKB$€£]+$/i.test(t);
}
function isUnit(t: string): boolean {
  return UNIT_TOKENS.has(t) || UNIT_TOKENS.has(t.replace(/[.,]$/, ""));
}
function endsSentence(t: string): boolean {
  return /[.!?؟۔]["'»)\]]?$/.test(t);
}
function hasTrailingPunct(t: string): boolean {
  return /[,،؛:;]["'»)\]]?$/.test(t);
}

const ms = (sec: number) => Math.round(sec * 1000);

// Glue rule: keep number↔unit and number↔number adjacent (don't break between).
function shouldGlue(a: CaptionWord, b: CaptionWord, keepNumbersWithUnits: boolean): boolean {
  if (!keepNumbersWithUnits) return false;
  if (isNumeric(a.w) && (isUnit(b.w) || isNumeric(b.w))) return true;
  if (isUnit(a.w) && isNumeric(b.w)) return true;
  return false;
}

let __wid = 0;
function nextId(prefix: string): string {
  __wid = (__wid + 1) % 1_000_000;
  return `${prefix}-${__wid.toString(36)}`;
}

// ── Semantic-ish grouper (heuristic) ────────────────────────────────────────
// Divides scene words into caption groups honoring: preferred size, natural
// pauses, sentence/clause punctuation, number+unit gluing, and min/max duration.
// The AI grouper (ai.ts) can override this with meaning-based boundaries; both
// produce the same CaptionGroup[] shape.
export function groupWords(words: CaptionWord[], spec: CaptionStyleSpec): CaptionGroup[] {
  const g = resolveGrouping(spec);
  const clean = words.map((w) => ({ ...w, w: (spec.uppercase ? w.w.toUpperCase() : w.w).trim() })).filter((w) => w.w);
  if (clean.length === 0) return [];

  const PAUSE_MS = 260; // a real gap between words → phrase boundary
  const chunks: CaptionWord[][] = [];
  let cur: CaptionWord[] = [];

  for (let i = 0; i < clean.length; i++) {
    const w = clean[i];
    cur.push(w);
    const next = clean[i + 1];
    const groupDurMs = ms(w.e) - ms(cur[0].s);
    const gapMs = next ? ms(next.s) - ms(w.e) : Infinity;
    const glue = next ? shouldGlue(w, next, g.keepNumbersWithUnits) : false;
    const longEnough = cur.length >= g.minWords;
    const atMax = cur.length >= g.maxWords;
    const overMaxDur = groupDurMs >= g.maxDurationMs;

    let boundary = false;
    if (glue) {
      boundary = false; // never split a number from its unit
    } else if (atMax || overMaxDur) {
      boundary = true;
    } else if (longEnough && (endsSentence(w.w) || hasTrailingPunct(w.w))) {
      boundary = true; // natural clause end
    } else if (longEnough && g.followVoicePauses && gapMs >= PAUSE_MS) {
      boundary = true; // voice pause
    } else if (cur.length >= g.targetWords && groupDurMs >= g.targetDurationMs * 0.5) {
      boundary = true; // reached preferred size with reasonable duration
    }

    if (boundary && next) {
      chunks.push(cur);
      cur = [];
    }
  }
  if (cur.length) chunks.push(cur);

  // merge sub-minimum-duration groups (except a legit one-word emphasis group)
  // into their previous neighbor when there's room. A one-word final group is
  // kept as a deliberate conclusion when single-word emphasis is allowed.
  const merged: CaptionWord[][] = [];
  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    const isLastChunk = c === chunks.length - 1;
    const durMs = ms(chunk[chunk.length - 1].e) - ms(chunk[0].s);
    const lastWord = chunk[chunk.length - 1].w;
    // conclusion emphasis: sentence-terminated, or the very last words of the scene
    const isEmphasis =
      chunk.length === 1 &&
      g.allowSingleWordEmphasisGroup &&
      (endsSentence(lastWord) || isLastChunk);
    const prev = merged[merged.length - 1];
    const tooShort = durMs < g.minDurationMs && !isEmphasis;
    const singleNonEmphasis = chunk.length === 1 && !isEmphasis;
    if ((tooShort || singleNonEmphasis) && prev && prev.length + chunk.length <= g.maxWords) {
      prev.push(...chunk);
    } else {
      merged.push(chunk);
    }
  }

  return merged.map((chunk) => {
    const wordUnits: WordUnit[] = chunk.map((w) => ({
      id: nextId("w"),
      text: w.w,
      startMs: ms(w.s),
      endMs: ms(w.e),
      direction: wordDirection(w.w),
    }));
    const text = wordUnits.map((w) => w.text).join(" ");
    return {
      groupId: nextId("g"),
      text,
      startMs: wordUnits[0].startMs,
      endMs: Math.max(wordUnits[wordUnits.length - 1].endMs, wordUnits[0].startMs + 200),
      direction: baseDirection(text),
      words: wordUnits,
    };
  });
}

// Builds caption groups from an explicit per-group word-count plan (e.g. from
// an AI semantic grouper). Counts are clamped to the word list; any leftover
// words form a final group. Falls back to heuristic grouping if counts are
// unusable (empty or summing to the wrong total).
export function groupWordsByCounts(
  words: CaptionWord[],
  counts: number[],
  spec: CaptionStyleSpec,
): CaptionGroup[] {
  const clean = words.map((w) => ({ ...w, w: (spec.uppercase ? w.w.toUpperCase() : w.w).trim() })).filter((w) => w.w);
  const valid = counts.filter((n) => Number.isInteger(n) && n > 0);
  const sum = valid.reduce((a, n) => a + n, 0);
  if (valid.length === 0 || sum < clean.length * 0.6) return groupWords(words, spec);

  const chunks: CaptionWord[][] = [];
  let idx = 0;
  for (const n of valid) {
    if (idx >= clean.length) break;
    chunks.push(clean.slice(idx, idx + n));
    idx += n;
  }
  if (idx < clean.length) {
    // leftover words: append to last group if small, else own group
    const rest = clean.slice(idx);
    const last = chunks[chunks.length - 1];
    if (last && last.length + rest.length <= (spec.maxWords ?? 5)) last.push(...rest);
    else chunks.push(rest);
  }

  return chunks
    .filter((c) => c.length)
    .map((chunk) => {
      const wordUnits: WordUnit[] = chunk.map((w) => ({
        id: nextId("w"),
        text: w.w,
        startMs: ms(w.s),
        endMs: ms(w.e),
        direction: wordDirection(w.w),
      }));
      const text = wordUnits.map((w) => w.text).join(" ");
      return {
        groupId: nextId("g"),
        text,
        startMs: wordUnits[0].startMs,
        endMs: Math.max(wordUnits[wordUnits.length - 1].endMs, wordUnits[0].startMs + 200),
        direction: baseDirection(text),
        words: wordUnits,
      };
    });
}

// Builds the self-contained per-scene caption JSON (scene-relative ms).
export function buildSceneCaption(
  sceneId: string,
  words: CaptionWord[],
  spec: CaptionStyleSpec,
  groups?: CaptionGroup[],
): SceneCaptionData {
  const captionGroups = groups && groups.length ? groups : groupWords(words, spec);
  const fullTranscript = captionGroups.map((grp) => grp.text).join(" ");
  const endMs = captionGroups.reduce((m, grp) => Math.max(m, grp.endMs), 0);
  return {
    sceneId,
    sceneStartMs: 0,
    sceneEndMs: endMs,
    language: baseDirection(fullTranscript) === "rtl" ? "ar" : "en",
    baseDirection: baseDirection(fullTranscript),
    fullTranscript,
    captionGroups,
  };
}

// ── Whole-video document ─────────────────────────────────────────────────────
export type CaptionDocument = {
  version: 2;
  width: number;
  height: number;
  fps: number;
  style: CaptionStyleSpec;
  scenes: Array<{ offsetMs: number; caption: SceneCaptionData }>;
};

export type SceneCaptionInput = {
  sceneId: string;
  offsetSec: number; // absolute start of this scene's audio in the final video
  words: CaptionWord[];
  groups?: CaptionGroup[]; // pre-grouped (edited) — used verbatim if present
};

export function buildCaptionDocument(
  scenes: SceneCaptionInput[],
  spec: CaptionStyleSpec,
  width: number,
  height: number,
  fps = 25,
): CaptionDocument {
  return {
    version: 2,
    width,
    height,
    fps,
    style: spec,
    scenes: scenes.map((s) => ({
      offsetMs: ms(s.offsetSec),
      caption: buildSceneCaption(s.sceneId, s.words, spec, s.groups),
    })),
  };
}

// Absolute-timed groups across the whole video (for burned renderers).
export type AbsGroup = {
  groupId: string;
  text: string;
  startMs: number;
  endMs: number;
  direction: Direction;
  words: WordUnit[]; // absolute ms
};

export function flattenGroups(doc: CaptionDocument): AbsGroup[] {
  const out: AbsGroup[] = [];
  for (const s of doc.scenes) {
    for (const grp of s.caption.captionGroups) {
      out.push({
        groupId: grp.groupId,
        text: grp.text,
        startMs: s.offsetMs + grp.startMs,
        endMs: s.offsetMs + grp.endMs,
        direction: grp.direction,
        words: grp.words.map((w) => ({ ...w, startMs: s.offsetMs + w.startMs, endMs: s.offsetMs + w.endMs })),
      });
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

// ── ASS / libass renderer (fallback) ─────────────────────────────────────────
function assColor(hex: string): string {
  const m = hex.replace("#", "");
  const r = m.slice(0, 2), gg = m.slice(2, 4), b = m.slice(4, 6);
  return `&H00${b}${gg}${r}`.toUpperCase();
}
function assTime(msVal: number): string {
  const t = Math.max(0, msVal) / 1000;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
function escapeAss(text: string): string {
  return text.replace(/\\/g, "").replace(/[{}]/g, "").replace(/\n/g, " ");
}

export function buildAss(doc: CaptionDocument): string {
  const { width, height, style: spec } = doc;
  const scale = height / 1080;
  const fontSize = Math.round(spec.fontSize * scale * (width > height ? 1 : 1.15));
  const align = spec.position === "top" || spec.position === "upper" ? 8 : spec.position === "middle" ? 5 : 2;
  const marginV = spec.position === "middle" ? 0 : Math.round(height * (spec.position === "upper" ? 0.2 : 0.08));
  const rtl = baseDirection(doc.scenes.map((s) => s.caption.fullTranscript).join(" ")) === "rtl";
  const fontName = rtl ? "Noto Naskh Arabic" : "Noto Sans";
  const sideMargin = Math.round(width * (1 - (spec.maxWidthPercent ?? 85) / 100) / 2);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 1
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,${fontName},${fontSize},${assColor(spec.baseColor)},${assColor(spec.baseColor)},${assColor(spec.outlineColor)},&H96000000,${spec.bold ? -1 : 0},0,0,0,100,100,0,0,1,${Math.round(spec.outlineWidth * scale)},2,${align},${sideMargin},${sideMargin},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const active = assColor(spec.activeColor);
  const base = assColor(spec.baseColor);
  const lines: string[] = [];
  for (const grp of flattenGroups(doc)) {
    const words = grp.words.map((w) => ({ ...w, text: escapeAss(w.text) })).filter((w) => w.text.trim());
    for (let i = 0; i < words.length; i++) {
      const start = words[i].startMs;
      const end = i + 1 < words.length ? words[i + 1].startMs : grp.endMs;
      if (end <= start) continue;
      const text = words
        .map((w, j) => (j === i && active !== base ? `{\\c${active}}${w.text}{\\c${base}}` : w.text))
        .join(" ");
      lines.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Cap,,0,0,0,,${text}`);
    }
  }
  return header + lines.join("\n") + "\n";
}

// ── SRT / VTT (one cue per group) ────────────────────────────────────────────
function pad2(n: number) { return String(n).padStart(2, "0"); }
function clockTime(msVal: number, comma: boolean): string {
  const t = Math.max(0, msVal) / 1000;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const msRem = Math.round((t % 1) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}${comma ? "," : "."}${String(msRem).padStart(3, "0")}`;
}

export function buildSrt(doc: CaptionDocument): string {
  const groups = flattenGroups(doc);
  return groups
    .map((grp, i) => {
      const text = grp.direction === "rtl" ? `‫${grp.text}‬` : grp.text;
      return `${i + 1}\n${clockTime(grp.startMs, true)} --> ${clockTime(grp.endMs, true)}\n${text}`;
    })
    .join("\n\n") + "\n";
}

export function buildVtt(doc: CaptionDocument): string {
  const body = flattenGroups(doc)
    .map((grp) => {
      const dir = grp.direction === "rtl" ? " direction:rtl" : "";
      const text = grp.direction === "rtl" ? `‫${grp.text}‬` : grp.text;
      return `${clockTime(grp.startMs, false)} --> ${clockTime(grp.endMs, false)}${dir}\n${text}`;
    })
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}

// ── Word timing estimation (mock / no-Whisper fallback) ──────────────────────
export function estimateWords(text: string, duration: number): CaptionWord[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const totalLen = tokens.reduce((a, t) => a + t.length + 1, 0);
  let cursor = 0;
  return tokens.map((w) => {
    const span = ((w.length + 1) / totalLen) * duration;
    const word = { w, s: cursor, e: cursor + span };
    cursor += span;
    return word;
  });
}
