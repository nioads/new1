"use client";

import { useEffect, useState } from "react";
import type { CategoryDto } from "@/lib/types";

export function Categories() {
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then(setCategories);
  }, []);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed");
      return;
    }
    setCategories((prev) =>
      [...prev, data].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setName("");
  }

  async function patchCategory(id: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = await res.json();
      setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)));
    }
  }

  async function deleteCategory(id: string) {
    if (!confirm("Delete this category?")) return;
    const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error);
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Categories</h1>
        <p className="text-sm text-slate-500">
          Categories label feeds and drive inbox filtering and notification muting.
        </p>
      </div>

      <form
        onSubmit={addCategory}
        className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex flex-wrap gap-2 items-center"
      >
        <input
          required
          placeholder="Category name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-48 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-10 h-9 rounded-lg bg-slate-800 border border-slate-700 cursor-pointer"
        />
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-medium"
        >
          Add
        </button>
        {error && <p className="w-full text-sm text-red-400">{error}</p>}
      </form>

      <ul className="space-y-2">
        {categories.map((cat) => (
          <li
            key={cat.id}
            className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex items-center gap-3"
          >
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
            <span className="text-sm text-white flex-1">{cat.name}</span>
            <span className="text-xs text-slate-500">
              {cat._count?.feeds ?? 0} feeds · {cat._count?.items ?? 0} items
            </span>
            <button
              onClick={() => patchCategory(cat.id, { muted: !cat.muted })}
              title={cat.muted ? "Unmute notifications" : "Mute notifications"}
              className="text-sm"
            >
              {cat.muted ? "🔕" : "🔔"}
            </button>
            <button
              onClick={() => deleteCategory(cat.id)}
              className="text-xs text-slate-500 hover:text-red-400"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
