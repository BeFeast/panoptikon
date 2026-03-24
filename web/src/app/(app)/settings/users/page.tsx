"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Plus,
  Trash2,
  ArrowLeft,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageTransition } from "@/components/PageTransition";
import { SettingsSection } from "@/components/settings/SettingsSection";
import Link from "next/link";
import type { User, UserRole } from "@/lib/types";

type Status = "idle" | "loading" | "success" | "error";

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [statusMsg, setStatusMsg] = useState("");

  // New user form
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("readonly");

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const res = await fetch("/api/v1/users", { credentials: "include" });
      if (res.ok) {
        const data: User[] = await res.json();
        setUsers(data);
      }
    } catch {
      // ignore
    }
  }

  async function handleCreateUser() {
    if (!newUsername.trim()) {
      setStatus("error");
      setStatusMsg("Username is required.");
      return;
    }
    if (newPassword.length < 8) {
      setStatus("error");
      setStatusMsg("Password must be at least 8 characters.");
      return;
    }

    setStatus("loading");
    setStatusMsg("");
    try {
      const res = await fetch("/api/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole,
        }),
        credentials: "include",
      });
      if (res.ok || res.status === 201) {
        setStatus("success");
        setStatusMsg(`User "${newUsername.trim()}" created.`);
        setNewUsername("");
        setNewPassword("");
        setNewRole("readonly");
        await loadUsers();
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        const body = await res.json().catch(() => ({}));
        setStatus("error");
        setStatusMsg(body.message || body.error || `Failed (${res.status}).`);
      }
    } catch {
      setStatus("error");
      setStatusMsg("Network error.");
    }
  }

  async function handleDeleteUser(id: string, username: string) {
    try {
      const res = await fetch(`/api/v1/users/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok || res.status === 204) {
        setStatus("success");
        setStatusMsg(`User "${username}" deleted.`);
        await loadUsers();
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        setStatus("error");
        setStatusMsg(`Failed to delete user (${res.status}).`);
      }
    } catch {
      setStatus("error");
      setStatusMsg("Network error.");
    }
  }

  async function handleRoleChange(id: string, role: UserRole) {
    try {
      const res = await fetch(`/api/v1/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
        credentials: "include",
      });
      if (res.ok) {
        await loadUsers();
      }
    } catch {
      // ignore
    }
  }

  const roleLabel = (role: string) => {
    switch (role) {
      case "admin":
        return "Admin";
      case "operator":
        return "Operator";
      case "readonly":
        return "Read-only";
      default:
        return role;
    }
  };

  const roleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-red-500/10 text-red-400 border-red-500/20";
      case "operator":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "readonly":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      default:
        return "bg-slate-500/10 text-slate-400 border-slate-500/20";
    }
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-lg space-y-6 py-8">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-white">User Management</h1>
        </div>

        {/* Status Messages */}
        {status === "success" && statusMsg && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
            <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
            <p className="text-xs text-emerald-400">{statusMsg}</p>
          </div>
        )}
        {status === "error" && statusMsg && (
          <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <p className="text-xs text-rose-400">{statusMsg}</p>
          </div>
        )}

        {/* Create User */}
        <SettingsSection
          icon={<Plus className="h-4 w-4 text-emerald-400" />}
          iconBg="bg-emerald-500/10"
          title="Create User"
          description="Add a new user with a role assignment."
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-username" className="text-xs text-slate-400">
                Username
              </Label>
              <Input
                id="new-username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="e.g. operator1"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-xs text-slate-400">
                Password
              </Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="Min. 8 characters"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-role" className="text-xs text-slate-400">
                Role
              </Label>
              <select
                id="new-role"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                <option value="admin">Admin — Full access</option>
                <option value="operator">Operator — Read + write</option>
                <option value="readonly">Read-only — View only</option>
              </select>
            </div>
            <Button
              onClick={handleCreateUser}
              disabled={status === "loading"}
              className="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Create User
            </Button>
          </div>
        </SettingsSection>

        {/* Existing Users */}
        <SettingsSection
          icon={<Users className="h-4 w-4 text-blue-400" />}
          iconBg="bg-blue-500/10"
          title="Users"
          description="Manage existing users and their roles."
        >
          {users.length === 0 ? (
            <p className="text-xs text-slate-500">
              No users created yet. The system uses single-admin authentication until users are added.
            </p>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-white">{user.username}</span>
                    <select
                      value={user.role}
                      onChange={(e) =>
                        handleRoleChange(user.id, e.target.value as UserRole)
                      }
                      className={`rounded-md border px-2 py-0.5 text-xs ${roleBadge(user.role)}`}
                    >
                      <option value="admin">Admin</option>
                      <option value="operator">Operator</option>
                      <option value="readonly">Read-only</option>
                    </select>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteUser(user.id, user.username)}
                    className="h-7 w-7 p-0 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </SettingsSection>
      </div>
    </PageTransition>
  );
}
