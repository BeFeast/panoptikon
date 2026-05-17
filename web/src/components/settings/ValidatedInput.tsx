"use client";

import { InputHTMLAttributes, forwardRef } from "react";
import { CheckCircle, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ValidationState = "idle" | "valid" | "error";

interface ValidatedInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  labelSuffix?: React.ReactNode;
  hint?: string;
  error?: string;
  validation?: ValidationState;
}

export const ValidatedInput = forwardRef<HTMLInputElement, ValidatedInputProps>(
  function ValidatedInput(
    { id, label, labelSuffix, hint, error, validation = "idle", className, ...props },
    ref,
  ) {
    const showValid = validation === "valid";
    const showError = validation === "error" || !!error;

    return (
      <div className="space-y-1.5">
        <Label htmlFor={id} className="text-xs text-slate-400">
          {label}
          {labelSuffix && <> {labelSuffix}</>}
        </Label>
        <div className="relative">
          <Input
            ref={ref}
            id={id}
            className={cn(
              "border-mesh-border-strong bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute",
              showValid && "border-emerald-500/40 pr-9",
              showError && "border-rose-500/40 pr-9",
              className,
            )}
            {...props}
          />
          {showValid && (
            <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-check-scale">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
            </div>
          )}
          {showError && (
            <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-fade-in">
              <XCircle className="h-4 w-4 text-rose-400" />
            </div>
          )}
        </div>
        {hint && !error && (
          <p className="text-[10px] text-slate-600">{hint}</p>
        )}
        {error && (
          <p className="animate-fade-in text-xs text-rose-400">{error}</p>
        )}
      </div>
    );
  },
);
