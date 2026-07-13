"use client";

import { forwardRef, useEffect, useRef } from "react";
import { Stage, Layer, Rect, Text, Image as KonvaImage, Group, Transformer } from "react-konva";
import type Konva from "konva";
import useImage from "use-image";
import type {
  TemplateElement,
  TextElement,
  ImageElement,
  LogoElement,
  RectElement,
  VariantDto,
} from "@/lib/template-types";

export type Bindings = {
  headline?: string;
  subtext?: string;
  source?: string;
  date?: string;
  backgroundSrc?: string;
  logoSrc?: string;
};

const ARABIC = /[؀-ۿ]/;

function proxied(src?: string): string | undefined {
  if (!src) return undefined;
  if (src.startsWith("/") || src.startsWith("data:")) return src;
  return `/api/media/proxy?url=${encodeURIComponent(src)}`;
}

function bindText(el: TextElement, b: Bindings): string {
  switch (el.role) {
    case "headline":
      return b.headline ?? el.text;
    case "subtext":
      return b.subtext ?? el.text;
    case "source":
      return b.source ?? el.text;
    case "date":
      return b.date ?? el.text;
    default:
      return el.text;
  }
}

function CoverImage({
  el,
  src,
  common,
}: {
  el: ImageElement;
  src?: string;
  common: Record<string, unknown>;
}) {
  const [img] = useImage(proxied(src) ?? "", "anonymous");
  if (!img) {
    return (
      <Rect
        {...common}
        width={el.width}
        height={el.height}
        fill="#1e293b"
        stroke="#334155"
        dash={[12, 8]}
        strokeWidth={2}
      />
    );
  }
  // CSS-style cover fit with zoom and pan offsets (-1..1)
  const zoom = Math.max(el.zoom ?? 1, 1);
  const scale = Math.max(el.width / img.width, el.height / img.height) * zoom;
  const visibleW = el.width / scale;
  const visibleH = el.height / scale;
  const cropX = ((img.width - visibleW) / 2) * (1 + (el.offsetX ?? 0));
  const cropY = ((img.height - visibleH) / 2) * (1 + (el.offsetY ?? 0));
  return (
    <KonvaImage
      {...common}
      image={img}
      width={el.width}
      height={el.height}
      crop={{ x: cropX, y: cropY, width: visibleW, height: visibleH }}
    />
  );
}

function ContainImage({
  el,
  src,
  common,
}: {
  el: LogoElement;
  src?: string;
  common: Record<string, unknown>;
}) {
  const [img] = useImage(proxied(src) ?? "", "anonymous");
  if (!img) {
    return (
      <Rect
        {...common}
        width={el.width}
        height={el.height}
        fill="rgba(148,163,184,0.15)"
        stroke="#475569"
        dash={[8, 6]}
        strokeWidth={2}
        cornerRadius={8}
      />
    );
  }
  const scale = Math.min(el.width / img.width, el.height / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  return (
    <Group {...common}>
      <KonvaImage
        image={img}
        x={(el.width - w) / 2}
        y={(el.height - h) / 2}
        width={w}
        height={h}
      />
      {/* invisible hit area matching the slot bounds */}
      <Rect width={el.width} height={el.height} fill="rgba(0,0,0,0)" />
    </Group>
  );
}

function ElementNode({
  el,
  bindings,
  fontFamily,
  editable,
  onSelect,
  onChange,
}: {
  el: TemplateElement;
  bindings: Bindings;
  fontFamily: string;
  editable: boolean;
  onSelect?: (id: string) => void;
  onChange?: (el: TemplateElement) => void;
}) {
  const common: Record<string, unknown> = {
    id: el.id,
    x: el.x,
    y: el.y,
    rotation: el.rotation ?? 0,
    opacity: el.opacity ?? 1,
    draggable: editable,
    onClick: () => onSelect?.(el.id),
    onTap: () => onSelect?.(el.id),
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) =>
      onChange?.({ ...el, x: Math.round(e.target.x()), y: Math.round(e.target.y()) }),
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const node = e.target;
      const next = {
        ...el,
        x: Math.round(node.x()),
        y: Math.round(node.y()),
        width: Math.max(20, Math.round(el.width * node.scaleX())),
        height: Math.max(20, Math.round(el.height * node.scaleY())),
        rotation: Math.round(node.rotation()),
      };
      node.scaleX(1);
      node.scaleY(1);
      onChange?.(next);
    },
  };

  if (el.kind === "rect") {
    const r = el as RectElement;
    const gradientProps = r.gradientTo
      ? {
          fillLinearGradientStartPoint: { x: 0, y: 0 },
          fillLinearGradientEndPoint: { x: 0, y: r.height },
          fillLinearGradientColorStops: [0, r.fill, 1, r.gradientTo],
        }
      : { fill: r.fill };
    return (
      <Rect
        {...common}
        width={r.width}
        height={r.height}
        cornerRadius={r.cornerRadius ?? 0}
        {...gradientProps}
      />
    );
  }

  if (el.kind === "image") {
    const i = el as ImageElement;
    const src = i.role === "background" ? (bindings.backgroundSrc ?? i.src) : i.src;
    return <CoverImage el={i} src={src} common={common} />;
  }

  if (el.kind === "logo") {
    const l = el as LogoElement;
    return <ContainImage el={l} src={bindings.logoSrc ?? l.src} common={common} />;
  }

  const t = el as TextElement;
  const value = bindText(t, bindings);
  const rtl = ARABIC.test(value);
  const pad = t.padding ?? 0;
  return (
    <Group {...common}>
      {t.bgColor && (
        <Rect width={t.width} height={t.height} fill={t.bgColor} cornerRadius={6} />
      )}
      <Text
        x={pad}
        y={pad}
        width={t.width - pad * 2}
        height={t.height - pad * 2}
        text={value}
        fontSize={t.fontSize}
        fontStyle={t.fontWeight === "bold" ? "bold" : "normal"}
        fontFamily={fontFamily}
        fill={t.fill}
        align={rtl && t.align === "left" ? "right" : t.align}
        verticalAlign={t.bgColor ? "middle" : "top"}
        lineHeight={t.lineHeight ?? 1.2}
        direction={rtl ? "rtl" : "ltr"}
        wrap="word"
        ellipsis
      />
    </Group>
  );
}

export type TemplateCanvasProps = {
  variant: VariantDto;
  bindings: Bindings;
  scale: number;
  fontFamily?: string;
  editable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onElementChange?: (el: TemplateElement) => void;
};

export const TemplateCanvas = forwardRef<Konva.Stage, TemplateCanvasProps>(
  function TemplateCanvas(
    { variant, bindings, scale, fontFamily, editable = false, selectedId, onSelect, onElementChange },
    stageRef,
  ) {
    const trRef = useRef<Konva.Transformer>(null);
    const layerRef = useRef<Konva.Layer>(null);

    useEffect(() => {
      if (!editable || !trRef.current || !layerRef.current) return;
      const node = selectedId ? layerRef.current.findOne(`#${selectedId}`) : null;
      trRef.current.nodes(node ? [node] : []);
    }, [selectedId, editable, variant.elements]);

    return (
      <Stage
        ref={stageRef}
        width={Math.round(variant.width * scale)}
        height={Math.round(variant.height * scale)}
        scaleX={scale}
        scaleY={scale}
        onMouseDown={(e) => {
          if (editable && e.target === e.target.getStage()) onSelect?.(null);
        }}
      >
        <Layer ref={layerRef}>
          <Rect x={0} y={0} width={variant.width} height={variant.height} fill="#0f172a" />
          {variant.elements.map((el) => (
            <ElementNode
              key={el.id}
              el={el}
              bindings={bindings}
              fontFamily={fontFamily || "system-ui, 'Segoe UI', Roboto, 'Noto Sans Arabic', Tahoma, sans-serif"}
              editable={editable}
              onSelect={(id) => onSelect?.(id)}
              onChange={onElementChange}
            />
          ))}
          {editable && (
            <Transformer
              ref={trRef}
              rotateEnabled
              flipEnabled={false}
              boundBoxFunc={(oldBox, newBox) =>
                newBox.width < 10 || newBox.height < 10 ? oldBox : newBox
              }
            />
          )}
        </Layer>
      </Stage>
    );
  },
);
