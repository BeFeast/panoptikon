"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Plus,
  Trash2,
  Pencil,
  ArrowLeft,
  Loader2,
  ShieldCheck,
  Eye,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageTransition } from "@/components/PageTransition";
import { SettingsSection } from "@/components/settings/SettingsSection";
import Link from "next/link";

interface User {
  id: string;
  username: string;
  role: "admin" | "read-only" | "operator";
  email: string | null;
  created_at: string;
  updated_at: string;
}

type FormMode = "idle" | "create" | "edit";

const ROLE_LABELS: Record<string, { label: string; icon: typeof ShieldCheck }> = {
  admin: { label: "Admin", icon: ShieldCheck },
  operator: { label: "Operator", icon: Wrench },
  "read-only": { label: "Read-only", icon: Eye },
};

export default function UsersSettingsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState<FormMode>("idle");
  const [editId, setEditId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("operator");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadUsers() {
    try {
      const res = await fetch("/api/v1/users", { credentials: "include" });
      if (res.ok) {
        const data: User[] = await res.json();
        setUsers(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function resetForm() {
    setFormMode("idle");
    setEditId(null);
    setUsername("");
    setPassword("");
    setEmail("");
    setRole("operator");
    setError("");
  }

  function startEdit(user: User) {
    setFormMode("edit");
    setEditId(user.id);
    setUsername(user.username);
    setEmail(user.email ?? "");
    setRole(user.role);
    setPassword("");
    setError("");
  }

  async function handleSubmit() {
    setError("");
    setSaving(true);
    try {
      if (formMode === "create") {
        const res = await fetch("/api/v1/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, role, email: email || undefined }),
          credentials: "include",
        });
        if (!res.ok) {
          const text = await res.text();
          setError(text || `Failed (${res.status})`);
          return;
        }
      } else if (formMode === "edit" && editId) {
        const body: Record<string, string | undefined> = {};
        if (username) body.username = username;
        if (password) body.password = password;
        if (role) body.role = role;
        body.email = email || "";
        const res = await fetch(`/api/v1/users/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          credentials: "include",
        });
        if (!res.ok) {
          const text = await res.text();
          setError(text || `Failed (${res.status})`);
          return;
        }
      }
      resetForm();
      loadUsers();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/v1/users/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || `Failed (${res.status})`);
        return;
      }
      loadUsers();
    } catch {
      setError("Network error");
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl space-y-6 py-8">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-mesh-border text-mesh-text-dim transition-colors hover:bg-mesh-surface-2/55 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-white">User Management</h1>
        </div>

        <SettingsSection
          icon={<Users className="h-4 w-4 text-mesh-primary" />}
          iconBg="bg-mesh-primary/10"
          title="Users & Roles"
          description="Manage users with role-based access control (admin, operator, read-only)."
          headerRight={
            formMode === "idle" ? (
              <Button
                size="sm"
                onClick={() => setFormMode("create")}
                className="bg-mesh-primary text-white hover:bg-mesh-primary"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add User
              </Button>
            ) : undefined
          }
        >
          {/* User list */}
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-mesh-text-dim">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading users…
            </div>
          ) : users.length === 0 ? (
            <p className="py-4 text-sm text-mesh-text-mute">
              No users created yet. Users can log in with their own credentials once created.
            </p>
          ) : (
            <div className="divide-y divide-mesh-border">
              {users.map((user) => {
                const roleInfo = ROLE_LABELS[user.role] ?? ROLE_LABELS.operator;
                const Icon = roleInfo.icon;
                return (
                  <div key={user.id} className="flex items-center gap-3 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-mesh-surface-2/55">
                      <Icon className="h-4 w-4 text-mesh-text-dim" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white">{user.username}</p>
                      <p className="text-xs text-mesh-text-mute">
                        {roleInfo.label}
                        {user.email ? ` · ${user.email}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-mesh-text-dim hover:text-white"
                        onClick={() => startEdit(user)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-mesh-text-dim hover:text-[#fb7185]"
                        onClick={() => handleDelete(user.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Create/Edit form */}
          {formMode !== "idle" && (
            <div className="space-y-3 mesh-card p-4">
              <p className="text-sm font-medium text-white">
                {formMode === "create" ? "New User" : "Edit User"}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="user-username" className="text-xs text-mesh-text-dim">
                  Username
                </Label>
                <Input
                  id="user-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="border-mesh-border bg-mesh-surface-1/95 text-white"
                  placeholder="johndoe"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-password" className="text-xs text-mesh-text-dim">
                  {formMode === "create" ? "Password" : "New Password (leave blank to keep)"}
                </Label>
                <Input
                  id="user-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-mesh-border bg-mesh-surface-1/95 text-white"
                  placeholder={formMode === "create" ? "Min 8 characters" : "Leave blank to keep current"}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-email" className="text-xs text-mesh-text-dim">
                  Email (optional)
                </Label>
                <Input
                  id="user-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-mesh-border bg-mesh-surface-1/95 text-white"
                  placeholder="user@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-role" className="text-xs text-mesh-text-dim">
                  Role
                </Label>
                <select
                  id="user-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full mesh-card px-3 py-2 text-sm text-white"
                >
                  <option value="admin">Admin</option>
                  <option value="operator">Operator</option>
                  <option value="read-only">Read-only</option>
                </select>
              </div>

              {error && (
                <p className="text-xs text-[#fb7185]">{error}</p>
              )}

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={saving || !username || (formMode === "create" && password.length < 8)}
                  className="bg-mesh-primary text-white hover:bg-mesh-primary"
                >
                  {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {formMode === "create" ? "Create" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={resetForm}
                  className="border-mesh-border-strong text-mesh-text"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </SettingsSection>
      </div>
    </PageTransition>
  );
}
