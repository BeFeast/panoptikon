"use client";

import { useState } from "react";
import { Lock, CheckCircle, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Status = "idle" | "loading" | "success" | "error";

export default function SettingsPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);

  const validationError = (() => {
    if (next && next.length < 8) return "New password must be at least 8 characters.";
    if (confirm && next !== confirm) return "Passwords do not match.";
    return "";
  })();

  const canSubmit =
    current.length > 0 &&
    next.length >= 8 &&
    next === confirm &&
    status !== "loading";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/v1/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: current, new_password: next }),
        credentials: "include",
      });

      if (res.status === 204) {
        setStatus("success");
        setCurrent("");
        setNext("");
        setConfirm("");
        // Redirect to login after 2s (sessions cleared server-side)
        setTimeout(() => {
          window.location.href = "/login";
        }, 2000);
      } else if (res.status === 401) {
        setStatus("error");
        setErrorMsg("Current password is incorrect.");
      } else if (res.status === 422) {
        setStatus("error");
        setErrorMsg("New password must be at least 8 characters.");
      } else {
        setStatus("error");
        setErrorMsg(`Unexpected error (${res.status}). Try again.`);
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Is the server reachable?");
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8">
      <h1 className="text-2xl font-semibold text-white">Settings</h1>

      {/* Change Password */}
      <Card className="border-[#2a2a3a] bg-[#16161f]">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <Lock className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base text-white">Change Password</CardTitle>
              <CardDescription className="text-xs text-gray-500">
                After changing, you'll be redirected to login again.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {status === "success" ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle className="h-10 w-10 text-green-400" />
              <p className="text-sm text-green-400">Password changed! Redirecting to login…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Current password */}
              <div className="space-y-1.5">
                <Label htmlFor="current" className="text-xs text-gray-400">
                  Current password
                </Label>
                <div className="relative">
                  <Input
                    id="current"
                    type={showCurrent ? "text" : "password"}
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                    className="border-[#2a2a3a] bg-[#0e0e16] pr-10 text-white placeholder:text-gray-600"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                    tabIndex={-1}
                  >
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div className="space-y-1.5">
                <Label htmlFor="new" className="text-xs text-gray-400">
                  New password
                </Label>
                <div className="relative">
                  <Input
                    id="new"
                    type={showNext ? "text" : "password"}
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    className="border-[#2a2a3a] bg-[#0e0e16] pr-10 text-white placeholder:text-gray-600"
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNext((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                    tabIndex={-1}
                  >
                    {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {/* Strength indicator */}
                {next.length > 0 && (
                  <div className="mt-1 flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`h-0.5 flex-1 rounded-full transition-colors ${
                          next.length >= i * 4
                            ? next.length < 8
                              ? "bg-red-500"
                              : next.length < 12
                                ? "bg-yellow-500"
                                : "bg-green-500"
                            : "bg-[#2a2a3a]"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Confirm */}
              <div className="space-y-1.5">
                <Label htmlFor="confirm" className="text-xs text-gray-400">
                  Confirm new password
                </Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="border-[#2a2a3a] bg-[#0e0e16] text-white placeholder:text-gray-600"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>

              {/* Validation / error message */}
              {(validationError || (status === "error" && errorMsg)) && (
                <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                  <p className="text-xs text-red-400">
                    {status === "error" && errorMsg ? errorMsg : validationError}
                  </p>
                </div>
              )}

              <Button
                type="submit"
                disabled={!canSubmit}
                className="w-full bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
              >
                {status === "loading" ? "Changing…" : "Change Password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Placeholder for future settings */}
      <Card className="border-[#2a2a3a] bg-[#16161f] opacity-50">
        <CardContent className="py-5">
          <p className="text-center text-xs text-gray-600">
            More settings (VyOS connection, notifications, agent defaults) — coming in v0.2
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
