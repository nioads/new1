"use client";

// LiveProvider: single SSE connection for the whole app.
// Exposes the unread count, the stream of newly arrived items, and
// browser push-notification enrollment.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { NewsItemDto } from "@/lib/types";

type Toast = { id: number; title: string; body: string };

type LiveContextValue = {
  unreadCount: number;
  setUnreadCount: (n: number) => void;
  lastBatch: NewsItemDto[] | null;
  pushEnabled: boolean;
  pushSupported: boolean;
  enablePush: () => Promise<void>;
  disablePush: () => Promise<void>;
};

const LiveContext = createContext<LiveContextValue | null>(null);

export function useLive() {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive must be used inside LiveProvider");
  return ctx;
}

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastBatch, setLastBatch] = useState<NewsItemDto[] | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const toastId = useRef(0);

  const addToast = useCallback((title: string, body: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, title, body }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  // SSE connection with auto-reconnect (EventSource reconnects natively).
  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.addEventListener("items", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as {
        items: NewsItemDto[];
        unreadCount: number;
      };
      setUnreadCount(data.unreadCount);
      setLastBatch(data.items);
      const first = data.items[0];
      if (first) {
        addToast(
          data.items.length === 1
            ? first.feed.title || "New item"
            : `${data.items.length} new items`,
          first.title,
        );
      }
    });
    return () => es.close();
  }, [addToast]);

  // Register the service worker and detect existing push subscription.
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setPushSupported(true);
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setPushEnabled(!!sub))
      .catch(() => {});
  }, []);

  const enablePush = useCallback(async () => {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
    const { publicKey } = await fetch("/api/push").then((r) => r.json());
    if (!publicKey) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicKey,
    });
    await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    setPushEnabled(true);
  }, []);

  const disablePush = useCallback(async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    setPushEnabled(false);
  }, []);

  return (
    <LiveContext.Provider
      value={{
        unreadCount,
        setUnreadCount,
        lastBatch,
        pushEnabled,
        pushSupported,
        enablePush,
        disablePush,
      }}
    >
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 w-80">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="rounded-xl bg-slate-900 border border-slate-700 shadow-lg p-3 text-sm"
          >
            <p className="font-medium text-white truncate">{t.title}</p>
            <p className="text-slate-400 line-clamp-2" dir="auto">
              {t.body}
            </p>
          </div>
        ))}
      </div>
    </LiveContext.Provider>
  );
}
