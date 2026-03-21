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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageTransition } from "@/components/PageTransition";
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
          <h1 className="text-3xl font-bold tracking-tight font-display text-white">Change Password</h1>
        </div>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                <Lock className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-base text-white">
                  Password
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  After changing, you&apos;ll be redirected to login again.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
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
                      className="border-slate-800 bg-slate-950 pr-10 text-white placeholder:text-slate-600"
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
                  {next.length > 0 && (
                    <div className="mt-1 flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`h-0.5 flex-1 rounded-full transition-colors ${
                            next.length >= i * 4
                              ? next.length < 8
                                ? "bg-rose-500"
                                : next.length < 12
                                  ? "bg-yellow-500"
                                  : "bg-emerald-500"
                              : "bg-slate-800"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm" className="text-xs text-slate-400">
                    Confirm new password
                  </Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </div>

                {(validationError || (pwStatus === "error" && pwError)) && (
                  <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                    <p className="text-xs text-rose-400">
                      {pwStatus === "error" && pwError ? pwError : validationError}
                    </p>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={!canSubmitPw}
                  className="w-full bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
                >
                  {pwStatus === "loading" ? "Changing…" : "Change Password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
