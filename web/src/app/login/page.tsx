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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.startsWith("API error 429")) {
        setError("Too many login attempts. Please try again later.");
      } else {
        setError("Invalid password");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8">
      <div className="relative z-10 w-full max-w-sm px-4">
        <Card className="login-card-glow w-full rounded-md border-slate-800/90 bg-slate-950/95 backdrop-blur-sm">
          <CardHeader className="items-center border-b border-slate-800/80 pb-4">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-md border border-cyan-400/50 bg-cyan-500 shadow-[0_0_28px_rgba(34,211,238,0.18)]">
              <span className="font-display text-2xl font-bold text-slate-950">P</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-white">
              Panoptikon
            </h1>
            <p className="text-center text-xs uppercase tracking-[0.2em] text-cyan-300/80">
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
                  <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400" disabled={loading}>
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
