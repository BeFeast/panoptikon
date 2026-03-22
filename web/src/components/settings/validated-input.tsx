"use client";

import { CheckCircle, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ValidationState = "idle" | "valid" | "invalid";

interface ValidatedInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  validationState?: ValidationState;
  inputId: string;
}

export function ValidatedInput({
  label,
  hint,
  error,
  validationState = "idle",
  inputId,
  className,
  ...props
}: ValidatedInputProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId} className="text-xs text-slate-400">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={inputId}
          className={`border-slate-800 bg-slate-950 text-white placeholder:text-slate-600 pr-9 ${
            validationState === "invalid"
              ? "border-rose-500/50 focus-visible:ring-rose-500/30"
              : validationState === "valid"
                ? "border-emerald-500/50 focus-visible:ring-emerald-500/30"
                : ""
          } ${className ?? ""}`}
          {...props}
        />
        {validationState === "valid" && (
          <CheckCircle className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-fade-in text-emerald-400" />
        )}
        {validationState === "invalid" && (
          <AlertCircle className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-fade-in text-rose-400" />
        )}
      </div>
      {error && validationState === "invalid" && (
        <p className="animate-fade-in text-[11px] text-rose-400">{error}</p>
      )}
      {hint && validationState !== "invalid" && (
        <p className="text-[10px] text-slate-600">{hint}</p>
      )}
    </div>
  );
}
