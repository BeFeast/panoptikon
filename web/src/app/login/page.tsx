"use client";

import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        setError("Invalid credentials");
        return;
      }

      const data = await res.json();
      localStorage.setItem("token", data.token);
      window.location.href = "/dashboard";
    } catch {
      setError("Connection failed");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-[#2a2a3a] bg-[#16161f] p-8">
        <h1 className="mb-2 text-center text-2xl font-bold text-white">
          Panoptikon
        </h1>
        <p className="mb-8 text-center text-sm text-gray-500">
          Sign in to your network dashboard
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-400">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md border border-[#2a2a3a] bg-background px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-accent focus:outline-none"
              placeholder="admin"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-400">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-[#2a2a3a] bg-background px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-accent focus:outline-none"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            className="w-full rounded-md bg-accent py-2 text-sm font-medium text-white hover:bg-blue-600 transition-colors"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
