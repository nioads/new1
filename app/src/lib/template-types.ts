export type Aspect = "16:9" | "9:16" | "1:1";

export const ASPECTS: { aspect: Aspect; width: number; height: number; label: string }[] = [
  { aspect: "16:9", width: 1920, height: 1080, label: "Landscape" },
  { aspect: "9:16", width: 1080, height: 1920, label: "Vertical" },
  { aspect: "1:1", width: 1080, height: 1080, label: "Square" },
];

// Roles bind elements to news-item data in the composer.
export type ElementRole =
  | "headline" // item title
  | "subtext" // item summary
  | "source" // feed name
  | "date" // publish date
  | "background" // item media / uploaded image
  | "logo" // brand logo
  | "static"; // fixed content set in the template

type Base = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
};

export type TextElement = Base & {
  kind: "text";
  role: ElementRole;
  text: string;
  fontSize: number;
  fontWeight: "normal" | "bold";
  fill: string;
  align: "left" | "center" | "right";
  bgColor?: string; // set → renders as a badge/ribbon
  padding?: number;
  lineHeight?: number;
};

export type ImageElement = Base & {
  kind: "image";
  role: "background" | "static";
  src?: string;
  // cover-fit adjustments applied in the composer
  offsetX?: number;
  offsetY?: number;
  zoom?: number;
};

export type LogoElement = Base & {
  kind: "logo";
  src?: string;
};

export type RectElement = Base & {
  kind: "rect";
  fill: string;
  cornerRadius?: number;
  gradientTo?: string; // set → vertical linear gradient fill → gradientTo
};

export type TemplateElement = TextElement | ImageElement | LogoElement | RectElement;

export type VariantDto = {
  id: string;
  aspect: Aspect;
  width: number;
  height: number;
  elements: TemplateElement[];
};

export type TemplateDto = {
  id: string;
  name: string;
  brandId: string | null;
  brand?: { id: string; name: string; logoUrl: string; primaryColor: string } | null;
  variants: VariantDto[];
  updatedAt?: string;
};

let counter = 0;
export function elementId(): string {
  return `el-${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// Starter layout: full-bleed background, bottom gradient, category badge,
// headline, source/date line, logo in a corner.
export function defaultElements(aspect: Aspect, w: number, h: number): TemplateElement[] {
  const pad = Math.round(w * 0.05);
  const headlineSize = aspect === "16:9" ? 84 : 64;
  const smallSize = aspect === "16:9" ? 34 : 30;
  const headlineH = Math.round(headlineSize * 3.4);
  return [
    {
      id: elementId(),
      kind: "image",
      role: "background",
      x: 0,
      y: 0,
      width: w,
      height: h,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    },
    {
      id: elementId(),
      kind: "rect",
      x: 0,
      y: Math.round(h * 0.45),
      width: w,
      height: Math.round(h * 0.55),
      fill: "rgba(0,0,0,0)",
      gradientTo: "rgba(0,0,0,0.92)",
    },
    {
      id: elementId(),
      kind: "text",
      role: "static",
      text: "BREAKING",
      x: pad,
      y: h - headlineH - Math.round(smallSize * 3.4) - pad,
      width: Math.round(w * 0.3),
      height: Math.round(smallSize * 1.9),
      fontSize: smallSize,
      fontWeight: "bold",
      fill: "#ffffff",
      align: "center",
      bgColor: "#dc2626",
      padding: 10,
    },
    {
      id: elementId(),
      kind: "text",
      role: "headline",
      text: "Headline goes here",
      x: pad,
      y: h - headlineH - pad,
      width: w - pad * 2,
      height: headlineH,
      fontSize: headlineSize,
      fontWeight: "bold",
      fill: "#ffffff",
      align: "left",
      lineHeight: 1.15,
    },
    {
      id: elementId(),
      kind: "text",
      role: "source",
      text: "Source",
      x: pad,
      y: h - pad + Math.round(pad * 0.15),
      width: Math.round(w * 0.5),
      height: Math.round(smallSize * 1.5),
      fontSize: Math.round(smallSize * 0.9),
      fontWeight: "normal",
      fill: "#e2e8f0",
      align: "left",
    },
    {
      id: elementId(),
      kind: "logo",
      x: w - pad - Math.round(w * 0.12),
      y: pad,
      width: Math.round(w * 0.12),
      height: Math.round(w * 0.12),
    },
  ];
}
