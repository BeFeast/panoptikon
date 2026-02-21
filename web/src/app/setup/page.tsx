"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Lock, Shield, Server } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAuthStatus, runSetup } from "@/lib/api";

export default function SetupPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [vyosUrl, setVyosUrl] = useState("");
  const [vyosApiKey, setVyosApiKey] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

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
        vyos_url: vyosUrl || undefined,
        vyos_api_key: vyosApiKey || undefined,
      });
      window.location.href = "/dashboard";
    } catch {
      setError("Setup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <Card className="w-full max-w-md border-slate-800 bg-slate-900">
        <CardHeader className="items-center pb-2">
          <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-500 shadow-lg shadow-blue-500/20">
            <Shield className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome to Panoptikon</h1>
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
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-9"
                    placeholder="Min. 8 characters"
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    id="confirm"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-9"
                    placeholder="Repeat password"
                    required
                  />
                </div>
              </div>

              <Separator className="my-4 bg-slate-800" />

              {/* Optional VyOS section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-300">
                    VyOS Router
                  </span>
                  <span className="text-xs text-slate-600">(optional)</span>
                </div>
                <p className="text-xs text-slate-500">
                  You can configure your VyOS router later in Settings.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="vyos-url">VyOS URL</Label>
                  <Input
                    id="vyos-url"
                    type="url"
                    value={vyosUrl}
                    onChange={(e) => setVyosUrl(e.target.value)}
                    placeholder="https://192.168.1.1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vyos-key">API Key</Label>
                  <Input
                    id="vyos-key"
                    type="password"
                    value={vyosApiKey}
                    onChange={(e) => setVyosApiKey(e.target.value)}
                    placeholder="VyOS HTTP API key"
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
    </div>
  );
}
