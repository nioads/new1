"use client";

import { useEffect, useRef, useState } from "react";
import type { BrandDto } from "@/lib/types";

export function Brands() {
  const [brands, setBrands] = useState<BrandDto[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<BrandDto | null>(null);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/brands").then((r) => r.json()).then(setBrands);
  }, []);

  async function addBrand(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed");
      return;
    }
    setBrands((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setSelected(data);
    setName("");
  }

  async function patchBrand(patch: Partial<BrandDto>) {
    if (!selected) return;
    const next = { ...selected, ...patch };
    setSelected(next);
    setBrands((prev) => prev.map((b) => (b.id === next.id ? next : b)));
  }

  async function save() {
    if (!selected) return;
    const res = await fetch(`/api/brands/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: selected.name,
        logoUrl: selected.logoUrl,
        primaryColor: selected.primaryColor,
        secondaryColor: selected.secondaryColor,
        fontFamily: selected.fontFamily,
        storageType: selected.storageType,
        s3Endpoint: selected.s3Endpoint,
        s3Region: selected.s3Region,
        s3Bucket: selected.s3Bucket,
        s3AccessKeyId: selected.s3AccessKeyId,
        s3SecretKey: selected.s3SecretKey,
        s3PublicBaseUrl: selected.s3PublicBaseUrl,
      }),
    });
    if (res.ok) setSavedAt(Date.now());
    else {
      const data = await res.json();
      setError(data.error ?? "Save failed");
    }
  }

  async function uploadLogo(file: File) {
    if (!selected) return;
    const form = new FormData();
    form.append("file", file);
    form.append("brandId", selected.id);
    form.append("kind", "logo");
    const res = await fetch("/api/uploads", { method: "POST", body: form });
    if (res.ok) {
      const asset = await res.json();
      patchBrand({ logoUrl: asset.url });
    }
  }

  async function deleteBrand(id: string) {
    if (!confirm("Delete this brand?")) return;
    const res = await fetch(`/api/brands/${id}`, { method: "DELETE" });
    if (res.ok) {
      setBrands((prev) => prev.filter((b) => b.id !== id));
      if (selected?.id === id) setSelected(null);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500";

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Brands</h1>
        <p className="text-sm text-slate-500">
          Each brand carries its logo, colors, font, and its own storage backend for
          media and renders.
        </p>
      </div>

      <form onSubmit={addBrand} className="flex gap-2">
        <input
          required
          placeholder="Brand / company name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 max-w-sm rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
        />
        <button className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-medium">
          Add brand
        </button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-6">
        <ul className="w-60 shrink-0 space-y-1">
          {brands.map((b) => (
            <li key={b.id}>
              <button
                onClick={() => setSelected(b)}
                className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left ${
                  selected?.id === b.id
                    ? "bg-indigo-600/20 text-indigo-300"
                    : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                {b.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.logoUrl} alt="" className="w-6 h-6 rounded object-contain bg-white/10" />
                ) : (
                  <span
                    className="w-6 h-6 rounded"
                    style={{ backgroundColor: b.primaryColor }}
                  />
                )}
                <span className="truncate">{b.name}</span>
              </button>
            </li>
          ))}
          {brands.length === 0 && (
            <li className="text-xs text-slate-600 px-3">No brands yet.</li>
          )}
        </ul>

        {selected && (
          <div className="flex-1 rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4 max-w-xl">
            <div className="flex items-center justify-between">
              <input
                value={selected.name}
                onChange={(e) => patchBrand({ name: e.target.value })}
                className="bg-transparent text-white font-medium border border-transparent hover:border-slate-700 focus:border-indigo-500 rounded-lg px-2 py-1 focus:outline-none"
              />
              <div className="flex items-center gap-3">
                {savedAt && <span className="text-xs text-emerald-400">Saved ✓</span>}
                <button
                  onClick={save}
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 text-sm font-medium"
                >
                  Save
                </button>
                <button
                  onClick={() => deleteBrand(selected.id)}
                  className="text-xs text-slate-500 hover:text-red-400"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
                {selected.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.logoUrl} alt="logo" className="max-w-full max-h-full object-contain" />
                ) : (
                  <span className="text-xs text-slate-600">No logo</span>
                )}
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => logoRef.current?.click()}
                  className="rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs"
                >
                  Upload logo
                </button>
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadLogo(f);
                    e.target.value = "";
                  }}
                />
                <p className="text-[11px] text-slate-600">PNG with transparency recommended.</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="block text-xs text-slate-400">
                Primary
                <input
                  type="color"
                  value={selected.primaryColor}
                  onChange={(e) => patchBrand({ primaryColor: e.target.value })}
                  className="mt-1 w-full h-9 rounded-lg bg-slate-800 border border-slate-700"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Secondary
                <input
                  type="color"
                  value={selected.secondaryColor}
                  onChange={(e) => patchBrand({ secondaryColor: e.target.value })}
                  className="mt-1 w-full h-9 rounded-lg bg-slate-800 border border-slate-700"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Font family
                <input
                  value={selected.fontFamily}
                  placeholder="system default"
                  onChange={(e) => patchBrand({ fontFamily: e.target.value })}
                  className={inputCls}
                />
              </label>
            </div>

            <div className="pt-2 border-t border-slate-800 space-y-3">
              <label className="block text-xs text-slate-400">
                Storage backend
                <select
                  value={selected.storageType}
                  onChange={(e) => patchBrand({ storageType: e.target.value as "LOCAL" | "S3" })}
                  className={inputCls}
                >
                  <option value="LOCAL">Local disk (server volume)</option>
                  <option value="S3">S3-compatible bucket</option>
                </select>
              </label>
              {selected.storageType === "S3" && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs text-slate-400">
                    Endpoint (empty = AWS)
                    <input
                      value={selected.s3Endpoint}
                      onChange={(e) => patchBrand({ s3Endpoint: e.target.value })}
                      placeholder="https://…"
                      className={inputCls}
                    />
                  </label>
                  <label className="block text-xs text-slate-400">
                    Region
                    <input
                      value={selected.s3Region}
                      onChange={(e) => patchBrand({ s3Region: e.target.value })}
                      placeholder="us-east-1"
                      className={inputCls}
                    />
                  </label>
                  <label className="block text-xs text-slate-400">
                    Bucket
                    <input
                      value={selected.s3Bucket}
                      onChange={(e) => patchBrand({ s3Bucket: e.target.value })}
                      className={inputCls}
                    />
                  </label>
                  <label className="block text-xs text-slate-400">
                    Public base URL (optional CDN)
                    <input
                      value={selected.s3PublicBaseUrl}
                      onChange={(e) => patchBrand({ s3PublicBaseUrl: e.target.value })}
                      className={inputCls}
                    />
                  </label>
                  <label className="block text-xs text-slate-400">
                    Access key ID
                    <input
                      value={selected.s3AccessKeyId}
                      onChange={(e) => patchBrand({ s3AccessKeyId: e.target.value })}
                      className={inputCls}
                    />
                  </label>
                  <label className="block text-xs text-slate-400">
                    Secret key
                    <input
                      type="password"
                      value={selected.s3SecretKey}
                      onChange={(e) => patchBrand({ s3SecretKey: e.target.value })}
                      className={inputCls}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
