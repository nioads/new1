"use client";

// Konva touches the DOM at import time — load the composer client-side only.
import dynamic from "next/dynamic";

const Composer = dynamic(
  () => import("@/components/composer").then((m) => m.Composer),
  { ssr: false, loading: () => <div className="p-10 text-slate-500 text-sm">Loading composer…</div> },
);

export function ComposerLoader({ itemId }: { itemId: string }) {
  return <Composer itemId={itemId} />;
}
