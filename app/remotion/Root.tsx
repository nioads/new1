import React from "react";
import { Composition } from "remotion";
import { CaptionOverlay, type CaptionDocument } from "./CaptionOverlay";

const EMPTY_DOC: CaptionDocument = {
  version: 2,
  width: 1080,
  height: 1920,
  fps: 25,
  style: {
    fontSize: 64,
    baseColor: "#ffffff",
    activeColor: "#ffd900",
    outlineColor: "#000000",
    outlineWidth: 5,
    bold: true,
    position: "middle",
    highlightMode: "background",
    activeBg: "#e11d48",
    activeScale: 1.06,
  },
  scenes: [],
};

function lastEndMs(doc: CaptionDocument): number {
  let end = 0;
  for (const s of doc.scenes) {
    for (const g of s.caption.captionGroups) end = Math.max(end, s.offsetMs + g.endMs);
  }
  return end;
}

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="captions"
      component={CaptionOverlay}
      durationInFrames={250}
      fps={25}
      width={1080}
      height={1920}
      defaultProps={{ doc: EMPTY_DOC }}
      calculateMetadata={({ props }) => {
        const doc = props.doc as CaptionDocument;
        const fps = doc.fps || 25;
        return {
          durationInFrames: Math.max(1, Math.ceil((lastEndMs(doc) / 1000 + 0.3) * fps)),
          fps,
          width: doc.width,
          height: doc.height,
        };
      }}
    />
  );
};
