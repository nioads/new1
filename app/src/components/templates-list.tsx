"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { TemplateDto } from "@/lib/template-types";
import type { BrandDto } from "@/lib/types";

export function TemplatesList() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [brands, setBrands] = useState<BrandDto[]>([]);
  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/templates").then((r) => r.json()).then(setTemplates);
    fetch("/api/brands").then((r) => r.json()).then(setBrands);
  }, []);

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, brandId: brandId || null }),
    });
    setBusy(false);
    if (res.ok) {
      const t = await res.json();
      router.push(`/templates/${t.id}`);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Delete this template?")) return;
    const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
    if (res.ok) setTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Image post templates</h1>
        <p className="text-sm text-slate-500">
          Every template ships with three linked sizes: 16:9, 9:16, and 1:1. New
          templates start from a breaking-news layout you can redesign freely.
        </p>
      </div>

      <form onSubmit={createTemplate} className="flex flex-wrap gap-2">
        <input
          required
          placeholder="Template name (e.g. Breaking Red)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-56 max-w-sm rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
        />
        <select
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
          className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-2 text-sm"
        >
          <option value="">No brand</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <button
          disabled={busy}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium"
        >
          {busy ? "Creating…" : "Create template"}
        </button>
      </form>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {templates.map((t) => (
          <li
            key={t.id}
            className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <Link
                href={`/templates/${t.id}`}
                className="text-sm font-medium text-white hover:text-indigo-300 truncate block"
              >
                {t.name}
              </Link>
              <p className="text-xs text-slate-500 mt-0.5">
                {t.brand?.name ?? "No brand"} · {t.variants.length} sizes
              </p>
            </div>
            <Link
              href={`/templates/${t.id}`}
              className="rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs"
            >
              Edit
            </Link>
            <button
              onClick={() => deleteTemplate(t.id)}
              className="text-xs text-slate-500 hover:text-red-400"
            >
              Delete
            </button>
          </li>
        ))}
        {templates.length === 0 && (
          <li className="text-sm text-slate-500">No templates yet — create one above.</li>
        )}
      </ul>
    </div>
  );
}
