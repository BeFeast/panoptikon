"use client";

import { Check, X } from "lucide-react";

function getStrength(password: string): {
  score: number;
  label: string;
  color: string;
  gradient: string;
} {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1)
    return {
      score,
      label: "Weak",
      color: "text-rose-400",
      gradient: "from-rose-500 to-rose-600",
    };
  if (score <= 2)
    return {
      score,
      label: "Fair",
      color: "text-amber-400",
      gradient: "from-rose-500 via-amber-500 to-amber-500",
    };
  if (score <= 3)
    return {
      score,
      label: "Good",
      color: "text-yellow-400",
      gradient: "from-amber-500 via-yellow-500 to-emerald-500",
    };
  return {
    score,
    label: "Strong",
    color: "text-emerald-400",
    gradient: "from-emerald-500 to-emerald-400",
  };
}

interface PasswordStrengthProps {
  password: string;
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  if (!password) return null;

  const { score, label, color, gradient } = getStrength(password);
  const widthPercent = Math.min((score / 5) * 100, 100);

  const requirements = [
    { met: password.length >= 8, text: "At least 8 characters" },
    {
      met: /[A-Z]/.test(password) && /[a-z]/.test(password),
      text: "Upper & lowercase letters",
    },
    { met: /\d/.test(password), text: "At least one number" },
    { met: /[^A-Za-z0-9]/.test(password), text: "Special character" },
  ];

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-500 ease-out`}
            style={{ width: `${widthPercent}%` }}
          />
        </div>
        <span className={`text-[11px] font-medium ${color}`}>{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {requirements.map((req) => (
          <div key={req.text} className="flex items-center gap-1.5">
            {req.met ? (
              <Check className="h-3 w-3 text-emerald-400" />
            ) : (
              <X className="h-3 w-3 text-slate-600" />
            )}
            <span
              className={`text-[10px] ${req.met ? "text-slate-400" : "text-slate-600"}`}
            >
              {req.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
