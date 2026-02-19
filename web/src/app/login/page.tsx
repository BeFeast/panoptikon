"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Lock, Shield } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAuthStatus, login, setupPassword } from "@/lib/api";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [firstRun, setFirstRun] = useState<boolean | null>(null);

  // Check if this is first-run (no password set yet)
  useEffect(() => {
    fetchAuthStatus()
      .then((status) => {
        if (status.authenticated) {
          window.location.href = "/dashboard";
          return;
        }
        setFirstRun(status.first_run);
      })
      .catch(() => {
        // API not reachable — assume login mode
        setFirstRun(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (firstRun && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 1) {
      setError("Password is required");
      return;
    }

    setLoading(true);
    try {
      let res;
      if (firstRun) {
        if (password.length < 8) {
          setError("Password must be at least 8 characters");
          setLoading(false);
          return;
        }
        res = await setupPassword(password);
      } else {
        res = await login(password);
      }
      localStorage.setItem("token", res.token);
      window.location.href = "/dashboard";
    } catch {
      setError(firstRun ? "Failed to set password" : "Invalid password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f]">
      <Card className="w-full max-w-sm border-[#2a2a3a] bg-[#16161f]">
        <CardHeader className="items-center pb-2">
          {/* Logo */}
          <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-500 shadow-lg shadow-blue-500/20">
            <Shield className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Panoptikon</h1>
          <p className="text-sm text-gray-500">
            {firstRun === null
              ? " "
              : firstRun
                ? "Welcome! Set your admin password."
                : "Sign in to your network dashboard"}
          </p>
        </CardHeader>

        <CardContent>
          {firstRun === null ? (
            /* Loading state */
            <div className="space-y-4 pt-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="password">
                  {firstRun ? "New Password" : "Password"}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-9"
                    placeholder="••••••••"
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
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

              {firstRun && (
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                    <Input
                      id="confirm"
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-9"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>
              )}

              {error && (
                <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading
                  ? firstRun
                    ? "Setting up…"
                    : "Signing in…"
                  : firstRun
                    ? "Set Password & Continue"
                    : "Sign In"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
