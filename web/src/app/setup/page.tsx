"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Lock, Shield } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAuthStatus, runSetup } from "@/lib/api";

export default function SetupPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [version, setVersion] = useState<string | null>(null);

  // If setup is already complete, redirect to login.
  useEffect(() => {
    fetchAuthStatus()
      .then((status) => {
        if (!status.needs_setup) {
          window.location.href = status.authenticated ? "/dashboard" : "/login";
          return;
        }
        setChecking(false);
      })
      .catch(() => {
        // If API unreachable, show setup form anyway — it'll fail on submit.
        setChecking(false);
      });

    // Fetch version (public endpoint)
    fetch("/api/v1/version")
      .then((r) => r.json())
      .then((data) => {
        if (data.version) setVersion(data.version);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await runSetup({
        password,
      });
      window.location.href = "/dashboard";
    } catch {
      setError("Setup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Animated gradient orbs */}
      <div className="login-orb pointer-events-none absolute -left-32 -top-32 h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-3xl" />
      <div className="login-orb-reverse pointer-events-none absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full bg-indigo-500/8 blur-3xl" />
      <div className="login-orb pointer-events-none absolute left-1/2 top-1/3 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-cyan-500/5 blur-3xl" />

      <div className="relative z-10 w-full max-w-md">
        {/* Glow behind card */}
        <div className="pointer-events-none absolute inset-0 -z-10 mx-auto flex items-center justify-center">
          <div className="h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
        </div>

        <Card className="login-card-glow w-full border-slate-800 bg-slate-900/90 backdrop-blur-sm">
          <CardHeader className="items-center pb-2">
            <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-500 shadow-lg shadow-blue-500/20">
              <Shield className="h-7 w-7 text-white" />
            </div>
            <h1 className="bg-gradient-to-r from-blue-400 via-blue-300 to-cyan-400 bg-clip-text text-2xl font-bold text-transparent">
              Welcome to Panoptikon
            </h1>
            <p className="text-center text-sm text-slate-500">
              Set up your admin password to get started.
            </p>
          </CardHeader>

          <CardContent>
            {checking ? (
              <div className="space-y-4 pt-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                {/* Password section */}
                <div className="space-y-2">
                  <Label htmlFor="password">Admin Password</Label>
                  <div className="input-focus-glow relative rounded-md">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9 pr-9 transition-shadow duration-200"
                      placeholder="Min. 8 characters"
                      autoFocus
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors duration-200 hover:text-white"
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      <span className="inline-block transition-transform duration-200">
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm Password</Label>
                  <div className="input-focus-glow relative rounded-md">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      id="confirm"
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-9 transition-shadow duration-200"
                      placeholder="Repeat password"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Setting up..." : "Complete Setup"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Version info */}
        {version && (
          <p className="mt-4 text-center text-xs text-slate-600">
            v{version}
          </p>
        )}
      </div>
    </div>
  );
}
