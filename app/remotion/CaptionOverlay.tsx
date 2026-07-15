// Remotion caption overlay — premium word-by-word animated captions rendered
// over a transparent background so the output webm can be composited onto any
// video by ffmpeg. Reads the Canonical Caption JSON (same cues libass uses).
import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
  continueRender,
  delayRender,
  interpolate,
  spring,
} from "remotion";

// These types mirror src/lib/captions.ts (kept local so the Remotion bundle has
// no dependency on the Next app's module graph / path aliases).
type CaptionToken = { text: string; start: number; end: number };
type CaptionCue = {
  start: number;
  end: number;
  text: string;
  tokens: CaptionToken[];
  lang: "ar" | "en";
  dir: "rtl" | "ltr";
};
type CaptionStyleSpec = {
  fontSize: number;
  baseColor: string;
  activeColor: string;
  outlineColor: string;
  outlineWidth: number;
  bold: boolean;
  uppercase: boolean;
  wordsPerGroup: number;
  position: "bottom" | "middle" | "top";
};
export type CaptionDocument = {
  version: 1;
  width: number;
  height: number;
  fps: number;
  lang: "ar" | "en";
  dir: "rtl" | "ltr";
  style: CaptionStyleSpec;
  cues: CaptionCue[];
};

const FONT_CSS = `
@font-face {
  font-family: 'CapArabic';
  src: url('${staticFile("fonts/NotoNaskhArabic-Regular.ttf")}') format('truetype');
  font-weight: 400;
}
@font-face {
  font-family: 'CapArabic';
  src: url('${staticFile("fonts/NotoNaskhArabic-Bold.ttf")}') format('truetype');
  font-weight: 700;
}
@font-face {
  font-family: 'CapLatin';
  src: url('${staticFile("fonts/DejaVuSans.ttf")}') format('truetype');
  font-weight: 400;
}
@font-face {
  font-family: 'CapLatin';
  src: url('${staticFile("fonts/DejaVuSans-Bold.ttf")}') format('truetype');
  font-weight: 700;
}
`;

function useFonts() {
  const [handle] = useState(() => delayRender("loading caption fonts"));
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (document.fonts?.ready) await document.fonts.ready;
      } catch {
        // fonts API unavailable — proceed anyway
      }
      if (!cancelled) continueRender(handle);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [handle]);
}

function outlineShadow(color: string, width: number): string {
  // Fake a text outline with layered shadows (crisp on transparent bg).
  const o: string[] = [];
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const a = (Math.PI * 2 * i) / steps;
    o.push(`${(Math.cos(a) * width).toFixed(1)}px ${(Math.sin(a) * width).toFixed(1)}px 0 ${color}`);
  }
  o.push(`0 ${Math.round(width * 1.2)}px ${Math.round(width * 2)}px rgba(0,0,0,0.55)`);
  return o.join(", ");
}

export const CaptionOverlay: React.FC<{ doc: CaptionDocument }> = ({ doc }) => {
  useFonts();
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const t = frame / fps;
  const spec = doc.style;

  const cue = doc.cues.find((c) => t >= c.start && t < c.end);
  if (!cue) return <AbsoluteFill />;

  const fontFamily = cue.dir === "rtl" ? "CapArabic" : "CapLatin";
  const fontSize = Math.round(spec.fontSize * (height / 1080) * (doc.width > doc.height ? 1 : 1.15));
  const justify =
    spec.position === "top" ? "flex-start" : spec.position === "middle" ? "center" : "flex-end";
  const padV = spec.position === "middle" ? 0 : Math.round(height * 0.08);

  // whole-cue pop-in
  const appear = spring({
    frame: frame - Math.round(cue.start * fps),
    fps,
    config: { damping: 200, mass: 0.5 },
    durationInFrames: Math.round(fps * 0.25),
  });

  return (
    <AbsoluteFill>
      <style dangerouslySetInnerHTML={{ __html: FONT_CSS }} />
      <AbsoluteFill
        style={{
          justifyContent: justify,
          alignItems: "center",
          paddingTop: spec.position === "top" ? padV : 0,
          paddingBottom: spec.position === "bottom" ? padV : 0,
          paddingLeft: Math.round(doc.width * 0.06),
          paddingRight: Math.round(doc.width * 0.06),
        }}
      >
        <div
          dir={cue.dir}
          style={{
            fontFamily,
            fontSize,
            fontWeight: spec.bold ? 700 : 400,
            lineHeight: 1.2,
            textAlign: "center",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: `0 ${Math.round(fontSize * 0.28)}px`,
            transform: `scale(${interpolate(appear, [0, 1], [0.86, 1])})`,
            direction: cue.dir,
          }}
        >
          {cue.tokens.map((tok, i) => {
            const isActive = t >= tok.start && t < (cue.tokens[i + 1]?.start ?? tok.end);
            const color = isActive && spec.activeColor !== spec.baseColor ? spec.activeColor : spec.baseColor;
            const pop = isActive
              ? spring({
                  frame: frame - Math.round(tok.start * fps),
                  fps,
                  config: { damping: 12, mass: 0.4 },
                  durationInFrames: Math.round(fps * 0.2),
                })
              : 1;
            return (
              <span
                key={i}
                style={{
                  color,
                  textShadow: outlineShadow(spec.outlineColor, spec.outlineWidth * (height / 1080)),
                  transform: isActive ? `scale(${interpolate(pop, [0, 1], [1, 1.12])})` : "scale(1)",
                  display: "inline-block",
                }}
              >
                {tok.text}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
