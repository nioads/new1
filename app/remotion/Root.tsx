import React from "react";
import { Composition } from "remotion";
import { CaptionOverlay, type CaptionDocument } from "./CaptionOverlay";

// A tiny fallback doc so the composition is valid when opened without props
// (e.g. in the Remotion studio). Real renders pass the project's document via
// inputProps + calculateMetadata.
const EMPTY_DOC: CaptionDocument = {
  version: 1,
  width: 1080,
  height: 1920,
  fps: 25,
  lang: "en",
  dir: "ltr",
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
  cues: [],
};

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
        const lastEnd = doc.cues.reduce((m, c) => Math.max(m, c.end), 0);
        const fps = doc.fps || 25;
        return {
          durationInFrames: Math.max(1, Math.ceil((lastEnd + 0.3) * fps)),
          fps,
          width: doc.width,
          height: doc.height,
        };
      }}
    />
  );
};
