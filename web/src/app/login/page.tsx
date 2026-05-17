"use client";

import { useEffect, useState } from "react";
import { Command, Eye, EyeOff, Lock } from "lucide-react";
import { fetchAuthStatus, login } from "@/lib/api";
import { BrandMark } from "@/components/brand/BrandMark";
import type { AuthStatus } from "@/lib/types";

function NetworkBackdrop() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full text-[#203b67] opacity-35"
      preserveAspectRatio="none"
    >
      <line
        x1="0"
        y1="18%"
        x2="16%"
        y2="34%"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.28"
      />
      <line
        x1="0"
        y1="92%"
        x2="20%"
        y2="94%"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.24"
      />
      <line
        x1="100%"
        y1="76%"
        x2="82%"
        y2="86%"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.2"
      />
      <line
        x1="86%"
        y1="34%"
        x2="100%"
        y2="57%"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.22"
      />
      <line
        x1="13%"
        y1="34%"
        x2="3%"
        y2="92%"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.24"
      />
      <circle cx="3%" cy="92%" r="5" fill="currentColor" opacity="0.42" />
      <circle cx="84%" cy="34%" r="4" fill="currentColor" opacity="0.28" />
    </svg>
  );
}

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);

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
        setAuthStatus(status);
        setReady(true);
      })
      .catch(() => setReady(true));

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
      setError(
        msg.startsWith("API error 429")
          ? "Too many login attempts. Please try again later."
          : "Invalid password",
      );
    } finally {
      setLoading(false);
    }
  };

  const ssoEnabled = Boolean(authStatus?.sso_enabled);
  const ssoLoginUrl = authStatus?.sso_login_url ?? null;

  return (
    <main className="login-bg relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-4 text-slate-100">
      <NetworkBackdrop />
      <section className="relative z-10 w-full max-w-[720px] rounded-[18px] border border-[#2c4d80] bg-[#091731]/96 px-10 py-6 shadow-[0_0_0_3px_rgba(55,91,145,0.34),0_0_42px_rgba(42,98,177,0.28),inset_0_1px_0_rgba(122,163,218,0.16)] max-md:max-w-[430px] max-md:px-6 max-md:py-6">
        <div className="mb-5 flex flex-col items-center text-center">
          <BrandMark size={48} className="text-sky-300" />
          <h1 className="mt-4 font-mono text-[28px] font-semibold uppercase leading-none tracking-[0.08em] text-slate-100 max-md:text-2xl">
            Panoptikon
          </h1>
          <p className="mt-3 font-mono text-[16px] leading-none tracking-[0.12em] text-[#6580a8] max-md:text-sm">
            core.lan <span className="px-3">·</span> v{version ?? "0.6.103"}
          </p>
        </div>

        {!ready ? (
          <div className="space-y-4">
            <div className="h-12 rounded-md border border-[#2b4c7e] bg-[#08142b]" />
            <div className="h-12 rounded-md border border-[#2b4c7e] bg-[#08142b]" />
            <div className="h-14 rounded-md bg-[#2f6af0]" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-3">
              <label
                htmlFor="operator"
                className="block font-mono text-[16px] font-semibold uppercase tracking-[0.08em] text-[#6a83aa] max-md:text-sm"
              >
                Operator
              </label>
              <input
                id="operator"
                value="operator"
                readOnly
                className="h-12 w-full rounded-[5px] border-2 border-[#2c5289] bg-[#091832] px-5 font-sans text-[22px] text-slate-100 outline-none shadow-[inset_0_0_0_1px_rgba(81,124,185,0.16)] max-md:h-12 max-md:text-lg"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <label
                  htmlFor="password"
                  className="block font-mono text-[16px] font-semibold uppercase tracking-[0.08em] text-[#6a83aa] max-md:text-sm"
                >
                  Password
                </label>
                <button
                  type="button"
                  className="font-mono text-[16px] font-semibold text-[#2f73ff] transition-colors hover:text-[#6ea1ff] max-md:text-sm"
                >
                  reset key
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 w-full rounded-[5px] border-2 border-[#2c5289] bg-[#091832] px-5 pr-14 font-mono text-[22px] tracking-[0.18em] text-slate-100 outline-none shadow-[inset_0_0_0_1px_rgba(81,124,185,0.16)] transition-colors focus:border-[#3c72bc] max-md:h-12 max-md:text-lg"
                  placeholder="••••••••••"
                  autoFocus
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#607aa2] transition-colors hover:text-slate-200"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 max-md:h-5 max-md:w-5" />
                  ) : (
                    <Eye className="h-5 w-5 max-md:h-5 max-md:w-5" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-md border border-rose-400/35 bg-rose-500/10 px-4 py-3 font-mono text-sm text-rose-200">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-6 flex h-14 w-full items-center justify-center gap-3 rounded-[5px] bg-[#316aec] text-[23px] font-semibold text-white shadow-[0_10px_24px_rgba(49,106,236,0.18)] transition-colors hover:bg-[#3f78ff] disabled:cursor-not-allowed disabled:opacity-70 max-md:h-14 max-md:text-xl"
            >
              <Lock className="h-5 w-5 stroke-[1.8] max-md:h-5 max-md:w-5" />
              {loading ? "Signing in" : "Sign in"}
            </button>

            {ssoEnabled && (
              <>
                <div className="flex items-center gap-4 py-2 font-mono text-[16px] font-semibold text-[#38537f] max-md:text-sm">
                  <div className="h-px flex-1 bg-[#1d3760]" />
                  OR
                  <div className="h-px flex-1 bg-[#1d3760]" />
                </div>

                <a
                  href={ssoLoginUrl ?? "/api/v1/auth/sso/login"}
                  className="flex h-12 w-full items-center justify-center gap-3 rounded-[5px] border-2 border-[#2c5289] bg-[#102142]/45 text-[22px] font-medium text-slate-100 transition-colors hover:border-[#3c72bc] hover:bg-[#13284f] max-md:h-12 max-md:text-lg"
                >
                  <Command className="h-5 w-5 stroke-[1.8] max-md:h-5 max-md:w-5" />
                  Continue with SSO
                </a>
              </>
            )}
          </form>
        )}

        <div className="mt-5 border-t border-[#1d3760] pt-4 font-mono text-[16px] text-[#637ea8] max-md:mt-6 max-md:text-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-[#46e27f] shadow-[0_0_16px_rgba(70,226,127,0.55)]" />
              <span>all systems healthy</span>
            </div>
            <span>14d 6h up</span>
          </div>
        </div>
      </section>
    </main>
  );
}
