"use client";

import { useState } from "react";
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageTransition } from "@/components/PageTransition";
import { SettingsSection } from "@/components/settings/settings-section";
import { SaveButton } from "@/components/settings/save-button";
import { PasswordStrength } from "@/components/settings/password-strength";
import Link from "next/link";

type Status = "idle" | "loading" | "success" | "error";

export default function PasswordSettingsPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwStatus, setPwStatus] = useState<Status>("idle");
  const [pwError, setPwError] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);

  const validationError = (() => {
    if (next && next.length < 8)
      return "New password must be at least 8 characters.";
    if (confirm && next !== confirm) return "Passwords do not match.";
    return "";
  })();

  const canSubmitPw =
    current.length > 0 &&
    next.length >= 8 &&
    next === confirm &&
    pwStatus !== "loading";

  async function handlePasswordSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSubmitPw) return;

    setPwStatus("loading");
    setPwError("");

    try {
      const res = await fetch("/api/v1/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: current,
          new_password: next,
        }),
        credentials: "include",
      });

      if (res.status === 204) {
        setPwStatus("success");
        setCurrent("");
        setNext("");
        setConfirm("");
        setTimeout(() => {
          window.location.href = "/login";
        }, 2000);
      } else if (res.status === 401) {
        setPwStatus("error");
        setPwError("Current password is incorrect.");
      } else if (res.status === 422) {
        setPwStatus("error");
        setPwError("New password must be at least 8 characters.");
      } else {
        setPwStatus("error");
        setPwError(`Unexpected error (${res.status}). Try again.`);
      }
    } catch {
      setPwStatus("error");
      setPwError("Network error. Is the server reachable?");
    }
  }

  const confirmValid =
    confirm === ""
      ? "idle"
      : confirm === next && next.length >= 8
        ? "valid"
        : "invalid";
  const nextValid =
    next === ""
      ? "idle"
      : next.length >= 8
        ? "valid"
        : "invalid";

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
          <h1 className="text-2xl font-semibold text-white">Change Password</h1>
        </div>

        <SettingsSection
          icon={<Lock className="h-4 w-4 text-blue-400" />}
          iconBg="bg-blue-500/10"
          title="Password"
          description="After changing, you'll be redirected to login again."
        >
          {pwStatus === "success" ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle className="h-10 w-10 text-emerald-400" />
              <p className="text-sm text-emerald-400">
                Password changed! Redirecting to login…
              </p>
            </div>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="current" className="text-xs text-slate-400">
                  Current password
                </Label>
                <div className="relative">
                  <Input
                    id="current"
                    type={showCurrent ? "text" : "password"}
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                    className="border-slate-800 bg-slate-950 pr-10 text-white placeholder:text-slate-600"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    tabIndex={-1}
                  >
                    {showCurrent ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new" className="text-xs text-slate-400">
                  New password
                </Label>
                <div className="relative">
                  <Input
                    id="new"
                    type={showNext ? "text" : "password"}
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    className={`border-slate-800 bg-slate-950 pr-10 text-white placeholder:text-slate-600 ${
                      nextValid === "invalid"
                        ? "border-rose-500/50 focus-visible:ring-rose-500/30"
                        : nextValid === "valid"
                          ? "border-emerald-500/50 focus-visible:ring-emerald-500/30"
                          : ""
                    }`}
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNext((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    tabIndex={-1}
                  >
                    {showNext ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <PasswordStrength password={next} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm" className="text-xs text-slate-400">
                  Confirm new password
                </Label>
                <div className="relative">
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={`border-slate-800 bg-slate-950 text-white placeholder:text-slate-600 ${
                      confirmValid === "invalid"
                        ? "border-rose-500/50 focus-visible:ring-rose-500/30"
                        : confirmValid === "valid"
                          ? "border-emerald-500/50 focus-visible:ring-emerald-500/30"
                          : ""
                    }`}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                  {confirmValid === "valid" && (
                    <CheckCircle className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-fade-in text-emerald-400" />
                  )}
                  {confirmValid === "invalid" && (
                    <AlertCircle className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-fade-in text-rose-400" />
                  )}
                </div>
                {confirmValid === "invalid" && (
                  <p className="animate-fade-in text-[11px] text-rose-400">
                    Passwords do not match
                  </p>
                )}
              </div>

              {pwStatus === "error" && pwError && (
                <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  <p className="text-xs text-rose-400">{pwError}</p>
                </div>
              )}

              <SaveButton
                status={pwStatus}
                disabled={!canSubmitPw}
                onClick={() => handlePasswordSubmit()}
                label="Change Password"
                className="w-full bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
              />
            </form>
          )}
        </SettingsSection>
      </div>
    </PageTransition>
  );
}
