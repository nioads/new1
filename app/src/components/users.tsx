"use client";

import { useEffect, useState } from "react";
import type { UserDto } from "@/lib/types";

export function Users({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<UserDto[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "EDITOR">("EDITOR");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then(setUsers);
  }, []);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, password, role }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed");
      return;
    }
    setUsers((prev) => [...prev, data]);
    setEmail("");
    setName("");
    setPassword("");
  }

  async function setUserRole(id: string, newRole: "ADMIN" | "EDITOR") {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
    }
  }

  async function deleteUser(id: string) {
    if (!confirm("Delete this user?")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error);
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Users</h1>
        <p className="text-sm text-slate-500">
          Admins manage users, brands, and settings. Editors manage feeds and content.
        </p>
      </div>

      <form
        onSubmit={addUser}
        className="rounded-xl bg-slate-900 border border-slate-800 p-4 grid grid-cols-2 gap-2"
      >
        <input
          required
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
        />
        <input
          required
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
        />
        <input
          required
          type="password"
          placeholder="Password (min 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
        />
        <div className="flex gap-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "ADMIN" | "EDITOR")}
            className="flex-1 rounded-lg bg-slate-800 border border-slate-700 px-2 py-2 text-sm"
          >
            <option value="EDITOR">Editor</option>
            <option value="ADMIN">Admin</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-medium"
          >
            Add
          </button>
        </div>
        {error && <p className="col-span-2 text-sm text-red-400">{error}</p>}
      </form>

      <ul className="space-y-2">
        {users.map((user) => (
          <li
            key={user.id}
            className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white">{user.name}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
            <select
              value={user.role}
              disabled={user.id === currentUserId}
              onChange={(e) => setUserRole(user.id, e.target.value as "ADMIN" | "EDITOR")}
              className="rounded-lg bg-slate-800 border border-slate-700 px-2 py-1 text-xs disabled:opacity-50"
            >
              <option value="EDITOR">Editor</option>
              <option value="ADMIN">Admin</option>
            </select>
            {user.id !== currentUserId && (
              <button
                onClick={() => deleteUser(user.id)}
                className="text-xs text-slate-500 hover:text-red-400"
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
