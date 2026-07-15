// Remotion caption overlay — progressive caption GROUPS with active-word
// highlighting, rendered over a transparent background so ffmpeg can composite
// it onto any video. This is the SAME component used for the per-scene preview
// and the final render, guaranteeing the editor and the output match exactly.
//
// Behavior (see spec): exactly one group visible at a time; the whole group
// stays visible while its words are spoken; only the current word is
// highlighted; the group disappears when its last word ends. Layout is stable —
// active-word scaling happens inside a fixed-size cell so nothing reflows.
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

type Direction = "rtl" | "ltr";
type WordUnit = { id: string; text: string; startMs: number; endMs: number; direction: Direction };
type CaptionGroup = {
  groupId: string;
  text: string;
  startMs: number;
  endMs: number;
  direction: Direction;
  words: WordUnit[];
};
type SceneCaptionData = { captionGroups: CaptionGroup[] };
type CaptionStyleSpec = {
  fontSize: number;
  baseColor: string;
  activeColor: string;
  outlineColor: string;
  outlineWidth: number;
  bold: boolean;
  position: "top" | "upper" | "middle" | "lower" | "bottom";
  lineHeight?: number;
  maxWidthPercent?: number;
  highlightMode?: "color" | "background" | "pill" | "underline";
  activeBg?: string;
  activeScale?: number;
  transitionMs?: number;
  holdUntilNextWord?: boolean;
  boxBackground?: "none" | "group" | "active";
  boxColor?: string;
  boxOpacity?: number;
  boxRadius?: number;
  boxPadding?: number;
  groupEntrance?: "none" | "fade" | "pop";
  groupExit?: "none" | "fade";
  reducedMotion?: boolean;
};
export type CaptionDocument = {
  version: 2;
  width: number;
  height: number;
  fps: number;
  style: CaptionStyleSpec;
  scenes: Array<{ offsetMs: number; caption: SceneCaptionData }>;
};

// Absolute-timed groups across the whole video (mirror of captions.ts).
type AbsGroup = CaptionGroup;
function flatten(doc: CaptionDocument): AbsGroup[] {
  const out: AbsGroup[] = [];
  for (const s of doc.scenes) {
    for (const g of s.caption.captionGroups) {
      out.push({
        ...g,
        startMs: s.offsetMs + g.startMs,
        endMs: s.offsetMs + g.endMs,
        words: g.words.map((w) => ({ ...w, startMs: s.offsetMs + w.startMs, endMs: s.offsetMs + w.endMs })),
      });
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

const FONT_CSS = `
@font-face { font-family:'CapArabic'; src:url('${staticFile("fonts/NotoNaskhArabic-Regular.ttf")}') format('truetype'); font-weight:400; }
@font-face { font-family:'CapArabic'; src:url('${staticFile("fonts/NotoNaskhArabic-Bold.ttf")}') format('truetype'); font-weight:700; }
@font-face { font-family:'CapLatin'; src:url('${staticFile("fonts/DejaVuSans.ttf")}') format('truetype'); font-weight:400; }
@font-face { font-family:'CapLatin'; src:url('${staticFile("fonts/DejaVuSans-Bold.ttf")}') format('truetype'); font-weight:700; }
`;

function useFonts() {
  const [handle] = useState(() => delayRender("loading caption fonts"));
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (document.fonts?.ready) await document.fonts.ready;
      } catch {
        /* fonts API unavailable */
      }
      if (!cancelled) continueRender(handle);
    })();
    return () => {
      cancelled = true;
    };
  }, [handle]);
}

function outlineShadow(color: string, width: number): string {
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
  const { fps, height, width } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;
  const spec = doc.style;
  const reduce = spec.reducedMotion === true;

  const groups = flatten(doc);
  const group = groups.find((g) => nowMs >= g.startMs && nowMs < g.endMs);
  if (!group) return <AbsoluteFill />;

  const fontFamily = group.direction === "rtl" ? "CapArabic" : "CapLatin";
  const fontSize = Math.round(spec.fontSize * (height / 1080) * (doc.width > doc.height ? 1 : 1.15));
  const justify =
    spec.position === "top" || spec.position === "upper"
      ? "flex-start"
      : spec.position === "middle"
        ? "center"
        : "flex-end";
  const padY =
    spec.position === "middle"
      ? 0
      : spec.position === "upper"
        ? Math.round(height * 0.2)
        : Math.round(height * 0.08);
  const highlightMode = spec.highlightMode ?? "background";
  const activeScale = reduce ? 1 : spec.activeScale ?? 1.06;
  const hold = spec.holdUntilNextWord ?? true;

  // group entrance / exit
  const entMode = reduce ? "fade" : spec.groupEntrance ?? "pop";
  const appear = spring({
    frame: frame - Math.round((group.startMs / 1000) * fps),
    fps,
    config: { damping: 200, mass: 0.5 },
    durationInFrames: Math.max(1, Math.round(fps * 0.22)),
  });
  const exitDur = 0.18;
  const exit =
    spec.groupExit === "none"
      ? 1
      : interpolate(nowMs, [group.endMs - exitDur * 1000, group.endMs], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  const opacity = Math.min(entMode === "none" ? 1 : appear, exit);
  const groupScale = entMode === "pop" ? interpolate(appear, [0, 1], [0.86, 1]) : 1;

  const activeIndex = group.words.findIndex((w, i) => {
    const end = hold ? group.words[i + 1]?.startMs ?? w.endMs : w.endMs;
    return nowMs >= w.startMs && nowMs < end;
  });

  const boxBg = spec.boxBackground ?? "none";
  const groupBoxStyle: React.CSSProperties =
    boxBg === "group"
      ? {
          background: hexA(spec.boxColor ?? "#000000", spec.boxOpacity ?? 0.5),
          borderRadius: spec.boxRadius ?? 14,
          padding: `${spec.boxPadding ?? Math.round(fontSize * 0.18)}px ${Math.round((spec.boxPadding ?? fontSize * 0.18) * 1.5)}px`,
        }
      : {};

  return (
    <AbsoluteFill>
      <style dangerouslySetInnerHTML={{ __html: FONT_CSS }} />
      <AbsoluteFill
        style={{
          justifyContent: justify,
          alignItems: "center",
          paddingTop: spec.position === "top" || spec.position === "upper" ? padY : 0,
          paddingBottom: spec.position === "bottom" || spec.position === "lower" ? padY : 0,
          paddingLeft: Math.round(width * 0.05),
          paddingRight: Math.round(width * 0.05),
        }}
      >
        <div
          dir={group.direction}
          style={{
            maxWidth: `${spec.maxWidthPercent ?? 85}%`,
            fontFamily,
            fontSize,
            fontWeight: spec.bold ? 700 : 400,
            lineHeight: spec.lineHeight ?? 1.25,
            textAlign: "center",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: `${Math.round(fontSize * 0.18)}px ${Math.round(fontSize * 0.26)}px`,
            direction: group.direction,
            unicodeBidi: "isolate",
            opacity,
            transform: `scale(${groupScale})`,
            ...groupBoxStyle,
          }}
        >
          {group.words.map((w, i) => {
            const isActive = i === activeIndex;
            const pop = isActive && !reduce
              ? spring({
                  frame: frame - Math.round((w.startMs / 1000) * fps),
                  fps,
                  config: { damping: 14, mass: 0.4 },
                  durationInFrames: Math.max(1, Math.round((spec.transitionMs ?? 140) / 1000 * fps)),
                })
              : 1;
            const scale = isActive ? interpolate(pop, [0, 1], [1, activeScale]) : 1;
            const color = isActive
              ? highlightMode === "color" || highlightMode === "underline"
                ? spec.activeColor
                : spec.baseColor
              : spec.baseColor;
            const bg =
              isActive && (highlightMode === "background" || highlightMode === "pill")
                ? spec.activeBg ?? spec.activeColor
                : "transparent";
            const cellPad = highlightMode === "pill" || highlightMode === "background"
              ? `${Math.round(fontSize * 0.06)}px ${Math.round(fontSize * 0.16)}px`
              : "0";
            return (
              // Fixed-size cell: reserves the word's base footprint so scaling
              // the inner span never reflows the line or moves siblings.
              <span
                key={w.id}
                dir={w.direction}
                style={{
                  display: "inline-flex",
                  unicodeBidi: "isolate",
                  position: "relative",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    transform: `scale(${scale})`,
                    transformOrigin: "center",
                    transition: reduce ? undefined : `transform ${spec.transitionMs ?? 140}ms ease-out`,
                    color,
                    background: bg,
                    borderRadius: highlightMode === "pill" ? 999 : highlightMode === "background" ? Math.round(fontSize * 0.14) : 0,
                    padding: cellPad,
                    borderBottom:
                      isActive && highlightMode === "underline"
                        ? `${Math.max(2, Math.round(fontSize * 0.06))}px solid ${spec.activeColor}`
                        : undefined,
                    textShadow: bg === "transparent" ? outlineShadow(spec.outlineColor, spec.outlineWidth * (height / 1080)) : "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {w.text}
                </span>
              </span>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

function hexA(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
