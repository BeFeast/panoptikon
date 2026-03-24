"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users,
  Plus,
  Trash2,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
  Shield,
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
  display_name: string | null;
  email: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

type Status = "idle" | "loading" | "success" | "error";

const roleLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  admin: { label: "Admin", icon: <Shield className="h-3.5 w-3.5" />, color: "text-red-400" },
  operator: { label: "Operator", icon: <Wrench className="h-3.5 w-3.5" />, color: "text-amber-400" },
  readonly: { label: "Read Only", icon: <Eye className="h-3.5 w-3.5" />, color: "text-blue-400" },
};

export default function UsersSettingsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("");

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("readonly");
  const [createStatus, setCreateStatus] = useState<Status>("idle");
  const [createMsg, setCreateMsg] = useState("");

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/users", { credentials: "include" });
      if (res.ok) {
        const data: User[] = await res.json();
        setUsers(data);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleCreate() {
    setCreateStatus("loading");
    setCreateMsg("");
    try {
      const res = await fetch("/api/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername,
          display_name: newDisplayName || undefined,
          email: newEmail || undefined,
          password: newPassword,
          role: newRole,
        }),
        credentials: "include",
      });
      if (res.ok || res.status === 201) {
        setCreateStatus("success");
        setCreateMsg("User created.");
        setNewUsername("");
        setNewDisplayName("");
        setNewEmail("");
        setNewPassword("");
        setNewRole("readonly");
        setShowForm(false);
        loadUsers();
        setTimeout(() => setCreateStatus("idle"), 3000);
      } else {
        const err = await res.text();
        setCreateStatus("error");
        setCreateMsg(err || `Failed (${res.status}).`);
      }
    } catch {
      setCreateStatus("error");
      setCreateMsg("Network error.");
    }
  }

  async function handleDelete(id: string, username: string) {
    setStatus("loading");
    setMsg("");
    try {
      const res = await fetch(`/api/v1/users/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok || res.status === 204) {
        setStatus("success");
        setMsg(`User "${username}" deleted.`);
        loadUsers();
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        const err = await res.text();
        setStatus("error");
        setMsg(err || `Failed (${res.status}).`);
      }
    } catch {
      setStatus("error");
      setMsg("Network error.");
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl space-y-6 py-8">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-white">User Management</h1>
        </div>

        <SettingsSection
          icon={<Users className="h-4 w-4 text-violet-400" />}
          iconBg="bg-violet-500/10"
          title="Users & Roles"
          description="Manage user accounts and role-based access control."
        >
          {/* Status messages */}
          {status === "success" && msg && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
              <p className="text-xs text-emerald-400">{msg}</p>
            </div>
          )}
          {status === "error" && msg && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <p className="text-xs text-rose-400">{msg}</p>
            </div>
          )}
          {createStatus === "success" && createMsg && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
              <p className="text-xs text-emerald-400">{createMsg}</p>
            </div>
          )}
          {createStatus === "error" && createMsg && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <p className="text-xs text-rose-400">{createMsg}</p>
            </div>
          )}

          {/* User list */}
          <div className="space-y-2">
            {users.map((user) => {
              const roleInfo = roleLabels[user.role] || roleLabels.readonly;
              return (
                <div
                  key={user.id}
                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-4 py-3"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{user.username}</span>
                      <span className={`flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-medium ${roleInfo.color}`}>
                        {roleInfo.icon}
                        {roleInfo.label}
                      </span>
                    </div>
                    {(user.display_name || user.email) && (
                      <p className="text-xs text-slate-500">
                        {user.display_name}{user.display_name && user.email ? " — " : ""}{user.email}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(user.id, user.username)}
                    disabled={status === "loading"}
                    className="text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            {users.length === 0 && (
              <p className="py-4 text-center text-xs text-slate-600">No users found.</p>
            )}
          </div>

          {/* Add user form */}
          {showForm ? (
            <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950 p-4">
              <p className="text-xs font-medium text-slate-400">New User</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="new-username" className="text-xs text-slate-400">Username</Label>
                  <Input id="new-username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="border-slate-800 bg-slate-900 text-white placeholder:text-slate-600" placeholder="johndoe" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-display-name" className="text-xs text-slate-400">Display Name</Label>
                  <Input id="new-display-name" value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} className="border-slate-800 bg-slate-900 text-white placeholder:text-slate-600" placeholder="John Doe" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-email" className="text-xs text-slate-400">Email</Label>
                  <Input id="new-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="border-slate-800 bg-slate-900 text-white placeholder:text-slate-600" placeholder="john@example.com" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password" className="text-xs text-slate-400">Password</Label>
                  <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="border-slate-800 bg-slate-900 text-white placeholder:text-slate-600" placeholder="Min 8 characters" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-role" className="text-xs text-slate-400">Role</Label>
                <select
                  id="new-role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white"
                >
                  <option value="admin">Admin — full access</option>
                  <option value="operator">Operator — manage devices, no settings</option>
                  <option value="readonly">Read Only — view only</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleCreate}
                  disabled={!newUsername || newPassword.length < 8 || createStatus === "loading"}
                  className="bg-violet-600 text-white hover:bg-violet-700"
                >
                  {createStatus === "loading" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                  Create User
                </Button>
                <Button variant="outline" onClick={() => setShowForm(false)} className="border-slate-800 text-slate-300 hover:bg-slate-800">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setShowForm(true)} className="bg-violet-600 text-white hover:bg-violet-700">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add User
            </Button>
          )}
        </SettingsSection>
      </div>
    </PageTransition>
  );
}
