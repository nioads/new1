"use client";

import { useEffect, useState } from "react";
import type { BrandDto, CategoryDto, FeedDto } from "@/lib/types";

export function Feeds() {
  const [feeds, setFeeds] = useState<FeedDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [brands, setBrands] = useState<BrandDto[]>([]);
  const [url, setUrl] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/feeds").then((r) => r.json()).then(setFeeds);
    fetch("/api/categories").then((r) => r.json()).then((c: CategoryDto[]) => {
      setCategories(c);
      if (c.length > 0) setCategoryId((prev) => prev || c[0].id);
    });
    fetch("/api/brands").then((r) => r.json()).then(setBrands);
  }, []);

  async function addFeed(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, categoryId, brandId: brandId || undefined }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to add feed");
      return;
    }
    setFeeds((prev) => [data, ...prev]);
    setUrl("");
  }

  async function patchFeed(id: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/feeds/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = await res.json();
      setFeeds((prev) => prev.map((f) => (f.id === id ? updated : f)));
    }
  }

  async function deleteFeed(id: string) {
    if (!confirm("Delete this feed and all its items?")) return;
    const res = await fetch(`/api/feeds/${id}`, { method: "DELETE" });
    if (res.ok) setFeeds((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Feeds</h1>
        <p className="text-sm text-slate-500">
          Every enabled feed is checked about every 30 seconds.
        </p>
      </div>

      <form
        onSubmit={addFeed}
        className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex flex-wrap gap-2 items-start"
      >
        <input
          type="url"
          required
          placeholder="https://example.com/rss.xml"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 min-w-64 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          required
          className="rounded-lg bg-slate-800 border border-slate-700 px-2 py-2 text-sm"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
          className="rounded-lg bg-slate-800 border border-slate-700 px-2 py-2 text-sm"
        >
          <option value="">No brand</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy || !categoryId}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium"
        >
          {busy ? "Checking…" : "Add feed"}
        </button>
        {error && <p className="w-full text-sm text-red-400">{error}</p>}
      </form>

      <ul className="space-y-2">
        {feeds.map((feed) => (
          <li
            key={feed.id}
            className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex flex-wrap items-center gap-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">
                {feed.title || feed.url}
              </p>
              <p className="text-xs text-slate-500 truncate">{feed.url}</p>
              {feed.lastError && (
                <p className="text-xs text-red-400 mt-1 truncate">
                  ⚠ {feed.lastError} (×{feed.errorCount})
                </p>
              )}
            </div>
            <span
              className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded"
              style={{
                color: feed.category.color,
                backgroundColor: `${feed.category.color}22`,
              }}
            >
              {feed.category.name}
            </span>
            {feed.brand && (
              <span className="text-[10px] text-slate-400 border border-slate-700 rounded px-1.5 py-0.5">
                {feed.brand.name}
              </span>
            )}
            <span className="text-xs text-slate-500">{feed._count.items} items</span>
            <select
              value={feed.categoryId}
              onChange={(e) => patchFeed(feed.id, { categoryId: e.target.value })}
              className="rounded-lg bg-slate-800 border border-slate-700 px-2 py-1 text-xs"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => patchFeed(feed.id, { muted: !feed.muted })}
              title={feed.muted ? "Unmute notifications" : "Mute notifications"}
              className="text-sm"
            >
              {feed.muted ? "🔕" : "🔔"}
            </button>
            <button
              onClick={() => patchFeed(feed.id, { enabled: !feed.enabled })}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                feed.enabled
                  ? "bg-emerald-600/20 text-emerald-300"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {feed.enabled ? "Active" : "Paused"}
            </button>
            <button
              onClick={() => deleteFeed(feed.id)}
              className="text-xs text-slate-500 hover:text-red-400"
            >
              Delete
            </button>
          </li>
        ))}
        {feeds.length === 0 && (
          <li className="text-sm text-slate-500 p-4">No feeds yet — add one above.</li>
        )}
      </ul>
    </div>
  );
}
