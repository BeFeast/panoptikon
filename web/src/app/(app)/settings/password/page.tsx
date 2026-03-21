"use client";

import { useState } from "react";
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  ArrowLeft,
} from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import {
  SettingsSection,
  ValidatedInput,
  AnimatedSaveButton,
  PasswordStrengthMeter,
} from "@/components/settings";
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

  const nextTooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && next !== confirm;

  const canSubmitPw =
    current.length > 0 &&
    next.length >= 8 &&
    next === confirm &&
    pwStatus !== "loading";

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
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
                Password changed! Redirecting to login&hellip;
              </p>
            </div>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <ValidatedInput
                id="current"
                label="Current password"
                type={showCurrent ? "text" : "password"}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                validationState={
                  pwStatus === "error" && pwError.includes("incorrect")
                    ? "invalid"
                    : "idle"
                }
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="text-slate-500 hover:text-slate-300"
                    tabIndex={-1}
                  >
                    {showCurrent ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                }
              />

              <div className="space-y-1">
                <ValidatedInput
                  id="new"
                  label="New password"
                  type={showNext ? "text" : "password"}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  validationState={
                    nextTooShort
                      ? "invalid"
                      : next.length >= 8
                        ? "valid"
                        : "idle"
                  }
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowNext((v) => !v)}
                      className="text-slate-500 hover:text-slate-300"
                      tabIndex={-1}
                    >
                      {showNext ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  }
                />
                <PasswordStrengthMeter password={next} />
              </div>

              <ValidatedInput
                id="confirm"
                label="Confirm new password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                validationState={
                  mismatch
                    ? "invalid"
                    : confirm.length > 0 && next === confirm
                      ? "valid"
                      : "idle"
                }
                validationMessage={
                  mismatch ? "Passwords do not match." : undefined
                }
              />

              {pwStatus === "error" && pwError && (
                <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                  <span className="h-4 w-4 shrink-0 text-rose-400">!</span>
                  <p className="text-xs text-rose-400">{pwError}</p>
                </div>
              )}

              <AnimatedSaveButton
                type="submit"
                status={pwStatus}
                disabled={!canSubmitPw}
                label="Change Password"
                className="w-full"
              />
            </form>
          )}
        </SettingsSection>
      </div>
    </PageTransition>
  );
}
