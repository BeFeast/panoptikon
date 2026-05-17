"use client";

import { useState } from "react";
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageTransition } from "@/components/PageTransition";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SaveButton } from "@/components/settings/SaveButton";
import { PasswordStrengthMeter } from "@/components/settings/PasswordStrengthMeter";
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

  async function handlePasswordSubmit() {
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

  // Inline validation states
  const currentValid = current.length > 0 ? "valid" : "idle";
  const nextValid =
    next.length === 0 ? "idle" : next.length >= 8 ? "valid" : "error";
  const confirmValid =
    confirm.length === 0
      ? "idle"
      : confirm === next
        ? "valid"
        : "error";

  return (
    <PageTransition>
      <div className="mx-auto max-w-lg space-y-6 py-8">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-mesh-border text-mesh-text-dim transition-colors hover:bg-mesh-surface-2/55 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Change Password</h1>
        </div>

        {pwStatus === "success" ? (
          <SettingsSection
            icon={<ShieldCheck className="h-4 w-4 text-[#4ade80]" />}
            iconBg="bg-[#4ade80]/10"
            title="Password Changed"
            description="Redirecting to login…"
          >
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle className="h-10 w-10 text-[#4ade80]" />
              <p className="text-sm text-[#4ade80]">
                Password changed! Redirecting to login…
              </p>
            </div>
          </SettingsSection>
        ) : (
          <>
            {/* Current Password Section */}
            <SettingsSection
              icon={<KeyRound className="h-4 w-4 text-mesh-primary" />}
              iconBg="bg-mesh-primary/10"
              title="Current Password"
              description="Verify your identity before making changes."
            >
              <div className="space-y-1.5">
                <Label htmlFor="current" className="text-xs text-mesh-text-dim">
                  Current password
                </Label>
                <div className="relative">
                  <Input
                    id="current"
                    type={showCurrent ? "text" : "password"}
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                    className={`border-mesh-border bg-mesh-surface-1 pr-10 text-white placeholder:text-mesh-text-mute ${
                      currentValid === "valid" ? "border-[#4ade80]/40" : ""
                    }`}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mesh-text-mute hover:text-mesh-text"
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
            </SettingsSection>

            {/* New Password Section */}
            <SettingsSection
              icon={<Lock className="h-4 w-4 text-[#c084fc]" />}
              iconBg="bg-[#c084fc]/10"
              title="New Password"
              description="Choose a strong password with at least 8 characters."
            >
              <div className="space-y-1.5">
                <Label htmlFor="new" className="text-xs text-mesh-text-dim">
                  New password
                </Label>
                <div className="relative">
                  <Input
                    id="new"
                    type={showNext ? "text" : "password"}
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    className={`border-mesh-border bg-mesh-surface-1 pr-10 text-white placeholder:text-mesh-text-mute ${
                      nextValid === "valid"
                        ? "border-[#4ade80]/40"
                        : nextValid === "error"
                          ? "border-[#fb7185]/40"
                          : ""
                    }`}
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNext((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mesh-text-mute hover:text-mesh-text"
                    tabIndex={-1}
                  >
                    {showNext ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {next.length > 0 && (
                  <PasswordStrengthMeter password={next} minLength={8} />
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm" className="text-xs text-mesh-text-dim">
                  Confirm new password
                </Label>
                <div className="relative">
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={`border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute ${
                      confirmValid === "valid"
                        ? "border-[#4ade80]/40"
                        : confirmValid === "error"
                          ? "border-[#fb7185]/40"
                          : ""
                    }`}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                  {confirmValid === "valid" && (
                    <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-check-scale">
                      <CheckCircle className="h-4 w-4 text-[#4ade80]" />
                    </div>
                  )}
                </div>
                {confirmValid === "error" && (
                  <p className="animate-fade-in text-xs text-[#fb7185]">
                    Passwords do not match.
                  </p>
                )}
              </div>
            </SettingsSection>

            {/* Error message */}
            {pwStatus === "error" && pwError && (
              <div className="flex items-center gap-2 rounded-md border border-[#fb7185]/30 bg-[#fb7185]/10 px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-[#fb7185]" />
                <p className="text-xs text-[#fb7185]">{pwError}</p>
              </div>
            )}

            {/* Save button */}
            <SaveButton
              status={pwStatus}
              disabled={!canSubmitPw}
              onClick={handlePasswordSubmit}
              label="Change Password"
              className="w-full"
            />
          </>
        )}
      </div>
    </PageTransition>
  );
}
