// ASS subtitle generation for burned-in captions (rendered by ffmpeg/libass —
// the standard stack for karaoke-style word highlighting; libass shapes
// Arabic/RTL text correctly).

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

export type SceneCaption = {
  offset: number; // absolute start time of the scene's audio in the final video
  words: CaptionWord[];
};

const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

function isMostlyArabic(scenes: SceneCaption[]): boolean {
  let ar = 0;
  let total = 0;
  for (const s of scenes)
    for (const w of s.words) {
      for (const ch of w.w) {
        if (/\s/.test(ch)) continue;
        total++;
        if (ARABIC_RE.test(ch)) ar++;
      }
    }
  return total > 0 && ar / total > 0.3;
}

export function buildAss(
  scenes: SceneCaption[],
  spec: CaptionStyleSpec,
  width: number,
  height: number,
): string {
  const scale = height / 1080;
  const fontSize = Math.round(spec.fontSize * scale * (width > height ? 1 : 1.15));
  const alignment = spec.position === "top" ? 8 : spec.position === "middle" ? 5 : 2;
  const marginV = spec.position === "middle" ? 0 : Math.round(height * 0.08);
  // Pick a font family that actually shapes the script — libass renders tofu
  // (boxes) when the chosen family lacks the glyphs. Noto Sans Arabic covers
  // Arabic with proper joining/shaping; Latin content uses Noto Sans.
  // Noto Naskh Arabic has complete ligature coverage (incl. lam-alef forms
  // that the Sans bold weight drops, which showed as tofu boxes); use it for
  // Arabic, Noto Sans for Latin.
  const arabic = isMostlyArabic(scenes);
  const fontName = arabic ? "Noto Naskh Arabic" : "Noto Sans";
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

  for (const scene of scenes) {
    const words = scene.words
      .map((w) => ({ ...w, w: escapeAss(spec.uppercase ? w.w.toUpperCase() : w.w) }))
      .filter((w) => w.w.trim());
    for (let g = 0; g < words.length; g += spec.wordsPerGroup) {
      const group = words.slice(g, g + spec.wordsPerGroup);
      // one dialogue line per word: whole group visible, active word tinted
      for (let i = 0; i < group.length; i++) {
        const start = scene.offset + group[i].s;
        const end = scene.offset + (i + 1 < group.length ? group[i + 1].s : group[group.length - 1].e);
        if (end <= start) continue;
        const text = group
          .map((w, j) =>
            j === i && active !== base ? `{\\c${active}}${w.w}{\\c${base}}` : w.w,
          )
          .join(" ");
        lines.push(
          `Dialogue: 0,${assTime(start)},${assTime(end)},Cap,,0,0,0,,${text}`,
        );
      }
    }
  }
  return header + lines.join("\n") + "\n";
}

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
