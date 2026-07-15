"use client";

// Konva touches the DOM at import time — load the editor client-side only.
import dynamic from "next/dynamic";

const TemplateEditor = dynamic(
  () => import("@/components/template-editor").then((m) => m.TemplateEditor),
  { ssr: false, loading: () => <div className="p-10 text-slate-500 text-sm">Loading editor…</div> },
);

export function EditorLoader({ templateId }: { templateId: string }) {
  return <TemplateEditor templateId={templateId} />;
}
