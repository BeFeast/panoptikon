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
      });
      window.location.href = "/dashboard";
    } catch {
      setError("Setup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg-mesh relative flex min-h-screen items-center justify-center overflow-x-hidden p-4">
      {/* Animated floating orbs */}
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />

      <Card className="login-card-glow relative z-10 w-full max-w-md border-slate-800 bg-slate-900/80 backdrop-blur-sm">
        <CardHeader className="items-center pb-2">
          <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-500 shadow-lg shadow-blue-500/20">
            <Shield className="h-7 w-7 text-white" />
          </div>
          <h1 className="login-gradient-text text-2xl font-bold">
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
                <div className="login-input relative rounded-md">
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
                    className="eye-toggle absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
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
                <div className="login-input relative rounded-md">
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
      <p className="absolute bottom-4 z-10 text-xs text-slate-600">
        Panoptikon
      </p>
    </div>
  );
}
