// Caption pipeline.
//
// Architecture: a single Canonical Caption JSON (CaptionDocument) is the source
// of truth. It is produced once from scene word timings, then fed to three
// independent renderers:
//   • Remotion       — premium word-by-word animated captions (headless Chrome)
//   • ASS / libass    — fast burned-in captions rendered by ffmpeg (fallback)
//   • SRT / VTT       — sidecar files for accessibility / platform captions
// All three read the exact same cues, so what you preview is what every output
// shows. libass shapes Arabic/RTL correctly; Remotion uses bundled Noto Naskh.

export type CaptionWord = { w: string; s: number; e: number }; // seconds, scene-relative

export type CaptionStyleSpec = {
  fontSize: number; // relative to 1080p height; scaled at build time
  baseColor: string; // #rrggbb
  activeColor: string;
  outlineColor: string;
  outlineWidth: number;
  bold: boolean;
  uppercase: boolean;
  wordsPerGroup: number;
  position: "bottom" | "middle" | "top";
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
      uppercase: true,
      wordsPerGroup: 3,
      position: "middle",
    },
  },
  {
    name: "Clean",
    style: {
      fontSize: 46,
      baseColor: "#ffffff",
      activeColor: "#ffffff",
      outlineColor: "#000000",
      outlineWidth: 3,
      bold: true,
      uppercase: false,
      wordsPerGroup: 5,
      position: "bottom",
    },
  },
  {
    name: "Minimal",
    style: {
      fontSize: 36,
      baseColor: "#e2e8f0",
      activeColor: "#e2e8f0",
      outlineColor: "#0f172a",
      outlineWidth: 2,
      bold: false,
      uppercase: false,
      wordsPerGroup: 7,
      position: "bottom",
    },
  },
];

// ── Canonical Caption JSON ────────────────────────────────────────────────
// Absolute-timed, renderer-agnostic representation shared by every output.

export type CaptionToken = { text: string; start: number; end: number }; // absolute seconds
export type CaptionCue = {
  start: number; // absolute seconds
  end: number;
  text: string; // joined display text of the cue
  tokens: CaptionToken[]; // word-level timing for karaoke highlighting
  lang: "ar" | "en";
  dir: "rtl" | "ltr";
};
export type CaptionDocument = {
  version: 1;
  width: number;
  height: number;
  fps: number;
  lang: "ar" | "en"; // dominant language of the whole document
  dir: "rtl" | "ltr";
  style: CaptionStyleSpec;
  cues: CaptionCue[];
};

export type SceneCaption = {
  offset: number; // absolute start time of the scene's audio in the final video
  words: CaptionWord[];
};

const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

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

// Builds the Canonical Caption JSON from per-scene word timings. Words are
// grouped into cues of `wordsPerGroup`; each cue is language-detected on its
// own so a bilingual video can mix RTL Arabic and LTR English cues correctly.
export function buildCaptionDocument(
  scenes: SceneCaption[],
  spec: CaptionStyleSpec,
  width: number,
  height: number,
  fps = 25,
): CaptionDocument {
  const cues: CaptionCue[] = [];
  const groupSize = Math.max(1, spec.wordsPerGroup);

  for (const scene of scenes) {
    const words = scene.words
      .map((w) => ({ ...w, w: (spec.uppercase ? w.w.toUpperCase() : w.w).trim() }))
      .filter((w) => w.w);
    for (let g = 0; g < words.length; g += groupSize) {
      const group = words.slice(g, g + groupSize);
      if (group.length === 0) continue;
      const tokens: CaptionToken[] = group.map((w) => ({
        text: w.w,
        start: scene.offset + w.s,
        end: scene.offset + w.e,
      }));
      const start = tokens[0].start;
      const end = Math.max(tokens[tokens.length - 1].end, start + 0.2);
      const text = group.map((w) => w.w).join(" ");
      const rtl = arabicRatio(text) > 0.3;
      cues.push({
        start,
        end,
        text,
        tokens,
        lang: rtl ? "ar" : "en",
        dir: rtl ? "rtl" : "ltr",
      });
    }
  }

  const allText = cues.map((c) => c.text).join(" ");
  const docRtl = arabicRatio(allText) > 0.3;
  return {
    version: 1,
    width,
    height,
    fps,
    lang: docRtl ? "ar" : "en",
    dir: docRtl ? "rtl" : "ltr",
    style: spec,
    cues,
  };
}

// ── ASS / libass renderer (fallback) ───────────────────────────────────────

function assColor(hex: string): string {
  // ASS uses &HBBGGRR&
  const m = hex.replace("#", "");
  const r = m.slice(0, 2), g = m.slice(2, 4), b = m.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

function assTime(seconds: number): string {
  const t = Math.max(0, seconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAss(text: string): string {
  return text.replace(/\\/g, "").replace(/[{}]/g, "").replace(/\n/g, " ");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function clockTime(seconds: number, comma: boolean): string {
  const t = Math.max(0, seconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t % 1) * 1000);
  const sep = comma ? "," : ".";
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}${sep}${String(ms).padStart(3, "0")}`;
}

// Renders the canonical document to ASS. libass shapes Arabic/RTL text and
// draws the karaoke word highlight; we pick a font that actually carries the
// glyphs (Noto Naskh Arabic has complete lam-alef ligature coverage that the
// Sans bold weight drops and would render as tofu boxes).
export function buildAss(doc: CaptionDocument): string {
  const { width, height, style: spec } = doc;
  const scale = height / 1080;
  const fontSize = Math.round(spec.fontSize * scale * (width > height ? 1 : 1.15));
  const alignment = spec.position === "top" ? 8 : spec.position === "middle" ? 5 : 2;
  const marginV = spec.position === "middle" ? 0 : Math.round(height * 0.08);
  const fontName = doc.dir === "rtl" ? "Noto Naskh Arabic" : "Noto Sans";
  const sideMargin = Math.round(width * 0.06);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 1
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,${fontName},${fontSize},${assColor(spec.baseColor)},${assColor(spec.baseColor)},${assColor(spec.outlineColor)},&H96000000,${spec.bold ? -1 : 0},0,0,0,100,100,0,0,1,${Math.round(spec.outlineWidth * scale)},2,${alignment},${sideMargin},${sideMargin},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines: string[] = [];
  const active = assColor(spec.activeColor);
  const base = assColor(spec.baseColor);

  for (const cue of doc.cues) {
    const tokens = cue.tokens.map((t) => ({ ...t, text: escapeAss(t.text) })).filter((t) => t.text.trim());
    // one dialogue line per word: whole cue visible, active word tinted
    for (let i = 0; i < tokens.length; i++) {
      const start = tokens[i].start;
      const end = i + 1 < tokens.length ? tokens[i + 1].start : tokens[tokens.length - 1].end;
      if (end <= start) continue;
      const text = tokens
        .map((t, j) => (j === i && active !== base ? `{\\c${active}}${t.text}{\\c${base}}` : t.text))
        .join(" ");
      lines.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Cap,,0,0,0,,${text}`);
    }
  }
  return header + lines.join("\n") + "\n";
}

// ── SRT / VTT sidecar export (accessibility / platform captions) ────────────
// One entry per cue (no per-word flashing — sidecar formats are read as blocks).

export function buildSrt(doc: CaptionDocument): string {
  return doc.cues
    .map((cue, i) => {
      const text = cue.dir === "rtl" ? `‫${cue.text}‬` : cue.text;
      return `${i + 1}\n${clockTime(cue.start, true)} --> ${clockTime(cue.end, true)}\n${text}`;
    })
    .join("\n\n") + "\n";
}

export function buildVtt(doc: CaptionDocument): string {
  const body = doc.cues
    .map((cue) => {
      const dir = cue.dir === "rtl" ? " direction:rtl" : "";
      const text = cue.dir === "rtl" ? `‫${cue.text}‬` : cue.text;
      return `${clockTime(cue.start, false)} --> ${clockTime(cue.end, false)}${dir}\n${text}`;
    })
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}

// ── Word timing estimation ──────────────────────────────────────────────────
// Fallback word timing: distribute words across a known duration weighted by
// word length. Used in mock mode and when Whisper output is unavailable.
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
