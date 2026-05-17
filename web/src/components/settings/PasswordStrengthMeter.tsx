"use client";

import { useMemo } from "react";

interface PasswordStrengthMeterProps {
  password: string;
  minLength?: number;
}

type Strength = "weak" | "fair" | "good" | "strong";

function getStrength(password: string, minLength: number): { level: Strength; score: number } {
  if (password.length === 0) return { level: "weak", score: 0 };

  let score = 0;
  if (password.length >= minLength) score++;
  if (password.length >= minLength + 4) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { level: "weak", score: 1 };
  if (score <= 2) return { level: "fair", score: 2 };
  if (score <= 3) return { level: "good", score: 3 };
  return { level: "strong", score: 4 };
}

const strengthConfig: Record<Strength, { label: string; color: string; gradient: string }> = {
  weak: {
    label: "Weak",
    color: "text-rose-400",
    gradient: "from-rose-500 to-rose-600",
  },
  fair: {
    label: "Fair",
    color: "text-yellow-400",
    gradient: "from-rose-500 via-yellow-500 to-yellow-500",
  },
  good: {
    label: "Good",
    color: "text-blue-400",
    gradient: "from-rose-500 via-yellow-500 to-blue-500",
  },
  strong: {
    label: "Strong",
    color: "text-emerald-400",
    gradient: "from-rose-500 via-yellow-500 via-blue-500 to-emerald-500",
  },
};

export function PasswordStrengthMeter({
  password,
  minLength = 8,
}: PasswordStrengthMeterProps) {
  const { level, score } = useMemo(
    () => getStrength(password, minLength),
    [password, minLength],
  );
  const config = strengthConfig[level];
  const widthPercent = password.length === 0 ? 0 : (score / 4) * 100;

  const meetsLength = password.length >= minLength;

  return (
    <div className="space-y-2" data-testid="password-strength-meter">
      {/* Animated gradient bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-mesh-surface-1">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${config.gradient} transition-all duration-500 ease-out`}
          style={{ width: `${widthPercent}%` }}
        />
      </div>

      {/* Strength label + requirements */}
      <div className="flex items-center justify-between">
        {password.length > 0 && (
          <span className={`text-[10px] font-medium ${config.color}`}>
            {config.label}
          </span>
        )}
        <div className="flex gap-3 text-[10px]">
          <span className={meetsLength ? "text-emerald-400" : "text-slate-600"}>
            {minLength}+ chars
          </span>
          <span className={/[A-Z]/.test(password) ? "text-emerald-400" : "text-slate-600"}>
            Uppercase
          </span>
          <span className={/\d/.test(password) ? "text-emerald-400" : "text-slate-600"}>
            Number
          </span>
          <span className={/[^A-Za-z0-9]/.test(password) ? "text-emerald-400" : "text-slate-600"}>
            Symbol
          </span>
        </div>
      </div>
    </div>
  );
}
