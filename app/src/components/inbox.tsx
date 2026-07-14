"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CategoryDto, FeedDto, NewsItemDto } from "@/lib/types";
import { useLive } from "@/components/live";

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function Inbox() {
  const { lastBatch, setUnreadCount } = useLive();
  const [items, setItems] = useState<NewsItemDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feeds, setFeeds] = useState<FeedDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [selected, setSelected] = useState<NewsItemDto | null>(null);

  const [categoryFilter, setCategoryFilter] = useState("");
  const [feedFilter, setFeedFilter] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedQuery(query), 300);
  }, [query]);

  const filterParams = useMemo(() => {
    const p = new URLSearchParams();
    if (categoryFilter) p.set("category", categoryFilter);
    if (feedFilter) p.set("feed", feedFilter);
    if (unreadOnly) p.set("unread", "1");
    if (debouncedQuery) p.set("q", debouncedQuery);
    return p;
  }, [categoryFilter, feedFilter, unreadOnly, debouncedQuery]);

  const loadItems = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      const p = new URLSearchParams(filterParams);
      if (cursor) p.set("cursor", cursor);
      const res = await fetch(`/api/items?${p}`);
      const data = await res.json();
      setItems((prev) => (cursor ? [...prev, ...data.items] : data.items));
      setNextCursor(data.nextCursor);
      setUnreadCount(data.unreadCount);
      setLoading(false);
    },
    [filterParams, setUnreadCount],
  );

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    fetch("/api/feeds").then((r) => r.json()).then(setFeeds);
    fetch("/api/categories").then((r) => r.json()).then(setCategories);
  }, []);

  // Prepend items arriving over SSE if they match the active filters.
  useEffect(() => {
    if (!lastBatch) return;
    setItems((prev) => {
      const known = new Set(prev.map((i) => i.id));
      const fresh = lastBatch.filter(
        (i) =>
          !known.has(i.id) &&
          (!categoryFilter || i.category.id === categoryFilter) &&
          (!feedFilter || i.feed.id === feedFilter) &&
          !debouncedQuery,
      );
      return fresh.length ? [...fresh, ...prev] : prev;
    });
  }, [lastBatch, categoryFilter, feedFilter, debouncedQuery]);

  async function toggleRead(item: NewsItemDto, read: boolean) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, readAt: read ? new Date().toISOString() : null } : i,
      ),
    );
    if (selected?.id === item.id) {
      setSelected({ ...item, readAt: read ? new Date().toISOString() : null });
    }
    const res = await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read }),
    });
    if (res.ok) {
      const p = new URLSearchParams(filterParams);
      // refresh unread badge cheaply
      fetch(`/api/items?${p}&limit=1`)
        .then((r) => r.json())
        .then((d) => setUnreadCount(d.unreadCount));
    }
  }

  function openItem(item: NewsItemDto) {
    setSelected(item);
    if (!item.readAt) toggleRead(item, true);
  }

  async function markAllRead() {
    await fetch("/api/items/read-all", { method: "POST" });
    setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
  }

  return (
    <div className="flex h-screen">
      {/* list pane */}
      <div className="flex-1 min-w-0 flex flex-col border-r border-slate-800">
        <div className="p-4 border-b border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-lg font-semibold">Inbox</h1>
            <button
              onClick={markAllRead}
              className="text-xs text-slate-400 hover:text-white"
            >
              Mark all read
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="flex-1 min-w-40 rounded-lg bg-slate-900 border border-slate-800 px-3 py-1.5 text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-sm"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={feedFilter}
              onChange={(e) => setFeedFilter(e.target.value)}
              className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-sm max-w-44"
            >
              <option value="">All feeds</option>
              {feeds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title || f.url}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-slate-300 px-1">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
                className="accent-indigo-600"
              />
              Unread
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 && !loading && (
            <div className="p-10 text-center text-slate-500 text-sm">
              No items yet. Add feeds and they&apos;ll appear here within ~30 seconds.
            </div>
          )}
          <ul className="divide-y divide-slate-800/70">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => openItem(item)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-900 transition flex gap-3 ${
                    selected?.id === item.id ? "bg-slate-900" : ""
                  }`}
                >
                  {item.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="w-16 h-16 rounded-lg object-cover shrink-0 bg-slate-800"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {!item.readAt && (
                        <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                      )}
                      <span
                        className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded"
                        style={{
                          color: item.category.color,
                          backgroundColor: `${item.category.color}22`,
                        }}
                      >
                        {item.category.name}
                      </span>
                      <span className="text-xs text-slate-500 truncate">
                        {item.feed.title}
                      </span>
                      <span className="text-xs text-slate-600 ml-auto shrink-0">
                        {timeAgo(item.publishedAt)}
                      </span>
                    </div>
                    <p
                      dir="auto"
                      className={`mt-1 text-sm line-clamp-2 ${
                        item.readAt ? "text-slate-400" : "text-white font-medium"
                      }`}
                    >
                      {item.title}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {nextCursor && (
            <div className="p-4">
              <button
                onClick={() => loadItems(nextCursor)}
                disabled={loading}
                className="w-full rounded-lg bg-slate-900 border border-slate-800 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* detail pane */}
      <div className="w-[42%] max-w-2xl shrink-0 overflow-y-auto hidden lg:block">
        {selected ? (
          <article className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span
                className="font-medium uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{
                  color: selected.category.color,
                  backgroundColor: `${selected.category.color}22`,
                }}
              >
                {selected.category.name}
              </span>
              <span>{selected.feed.title}</span>
              <span>·</span>
              <span>{new Date(selected.publishedAt).toLocaleString()}</span>
            </div>
            <h2 dir="auto" className="text-xl font-semibold text-white leading-snug">
              {selected.title}
            </h2>
            {selected.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.imageUrl}
                alt=""
                className="rounded-xl w-full object-cover max-h-80 bg-slate-800"
              />
            )}
            {selected.author && (
              <p className="text-xs text-slate-500">By {selected.author}</p>
            )}
            {(selected.media?.length ?? 0) > 1 && (
              <div>
                <p className="text-xs text-slate-500 mb-1.5">
                  Media in this article ({selected.media!.length})
                </p>
                <div className="grid grid-cols-4 gap-1.5">
                  {selected.media!.slice(0, 8).map((m) =>
                    m.type === "IMAGE" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={m.id}
                        src={m.url}
                        alt=""
                        title={m.source}
                        className="aspect-square rounded-lg object-cover bg-slate-800"
                      />
                    ) : (
                      <div
                        key={m.id}
                        title={`${m.type} — ${m.url}`}
                        className="aspect-square rounded-lg bg-slate-800 flex items-center justify-center text-lg"
                      >
                        {m.type === "VIDEO" ? "🎬" : "🎵"}
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}
            <p dir="auto" className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
              {(() => {
                const full = plainText(selected.content || "");
                const summary = plainText(selected.summary || "");
                // show the fuller of the two (worker enrichment fills content
                // with the complete article text)
                return full.length > summary.length ? full : summary;
              })()}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {selected.link && (
                <a
                  href={selected.link}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs text-slate-200"
                >
                  Open original ↗
                </a>
              )}
              <button
                onClick={() => toggleRead(selected, !selected.readAt)}
                className="rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs text-slate-200"
              >
                Mark {selected.readAt ? "unread" : "read"}
              </button>
              <a
                href={`/compose/${selected.id}`}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs text-white font-medium"
              >
                🖼 Image post
              </a>
              <a
                href={`/compose/${selected.id}`}
                className="rounded-lg bg-fuchsia-700 hover:bg-fuchsia-600 px-3 py-1.5 text-xs text-white font-medium"
              >
                🎬 Short video
              </a>
              <button
                disabled
                title="Coming in Phase 4"
                className="rounded-lg bg-indigo-600/30 px-3 py-1.5 text-xs text-indigo-300 opacity-60 cursor-not-allowed"
              >
                📹 Article → video
              </button>
            </div>
          </article>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-600 text-sm">
            Select an item to read it
          </div>
        )}
      </div>
    </div>
  );
}
