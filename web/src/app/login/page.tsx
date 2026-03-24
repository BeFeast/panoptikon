"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAuthStatus, login } from "@/lib/api";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState<string | null>(null);

  // Check auth status — redirect to /setup if first-run, /dashboard if already logged in.
  useEffect(() => {
    fetchAuthStatus()
      .then((status) => {
        if (status.authenticated) {
          window.location.href = "/dashboard";
          return;
        }
        if (status.needs_setup) {
          window.location.href = "/setup";
          return;
        }
        setReady(true);
      })
      .catch(() => {
        // API not reachable — show login form anyway.
        setReady(true);
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

    if (password.length < 1) {
      setError("Password is required");
      return;
    }

    setLoading(true);
    try {
      await login(password);
      window.location.href = "/dashboard";
    } catch {
      setError("Invalid password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Animated gradient orbs */}
      <div className="login-orb pointer-events-none absolute -left-32 -top-32 h-[500px] w-[500px] rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="login-orb-reverse pointer-events-none absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full bg-slate-500/8 blur-3xl" />
      <div className="login-orb pointer-events-none absolute left-1/2 top-1/3 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-cyan-500/5 blur-3xl" />

      <div className="relative z-10 w-full max-w-sm px-4">
        {/* Glow behind card */}
        <div className="pointer-events-none absolute inset-0 -z-10 mx-auto flex items-center justify-center">
          <div className="h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        </div>

        <Card className="login-card-glow w-full border-slate-800 bg-slate-900/90 backdrop-blur-sm">
          <CardHeader className="items-center pb-2">
            {/* Logo */}
            <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-xl bg-cyan-500 shadow-lg shadow-cyan-500/20">
              <span className="text-2xl font-bold text-slate-950">P</span>
            </div>
            <h1 className="font-display bg-gradient-to-r from-cyan-400 via-cyan-300 to-teal-400 bg-clip-text text-2xl font-bold text-transparent">
              Panoptikon
            </h1>
            <p className="text-sm text-slate-500">
              Sign in to your network operations console
            </p>
          </CardHeader>

          <CardContent>
            {!ready ? (
              /* Loading state */
              <div className="space-y-4 pt-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="input-focus-glow relative rounded-md">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9 pr-9 transition-shadow duration-200"
                      placeholder="••••••••"
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

                {error && (
                  <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
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
