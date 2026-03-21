"use client";

interface PasswordStrengthMeterProps {
  password: string;
}

function getStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  if (password.length === 0) return { score: 0, label: "", color: "" };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1)
    return { score: 1, label: "Weak", color: "from-rose-500 to-rose-600" };
  if (score <= 2)
    return {
      score: 2,
      label: "Fair",
      color: "from-orange-500 to-amber-500",
    };
  if (score <= 3)
    return {
      score: 3,
      label: "Good",
      color: "from-yellow-500 to-emerald-500",
    };
  return {
    score: 4,
    label: "Strong",
    color: "from-emerald-500 to-emerald-400",
  };
}

export function PasswordStrengthMeter({
  password,
}: PasswordStrengthMeterProps) {
  const { score, label, color } = getStrength(password);

  if (password.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 overflow-hidden rounded-full bg-slate-800"
          >
            <div
              className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${
                i <= score ? color : ""
              }`}
              style={{ width: i <= score ? "100%" : "0%" }}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-slate-500">
          {password.length < 8 ? (
            <span className="text-rose-400">Min. 8 characters required</span>
          ) : (
            `${label} password`
          )}
        </p>
        <p className="text-[10px] text-slate-600">{password.length} chars</p>
      </div>
    </div>
  );
}
