"use client";

import { InputHTMLAttributes, ReactNode, forwardRef } from "react";
import { CheckCircle, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ValidationState = "idle" | "valid" | "invalid";

interface ValidatedInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  hint?: string;
  validationState?: ValidationState;
  validationMessage?: string;
  rightElement?: ReactNode;
}

export const ValidatedInput = forwardRef<HTMLInputElement, ValidatedInputProps>(
  function ValidatedInput(
    {
      id,
      label,
      hint,
      validationState = "idle",
      validationMessage,
      rightElement,
      className,
      ...inputProps
    },
    ref
  ) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id} className="text-xs text-slate-400">
          {label}
        </Label>
        <div className="relative">
          <Input
            ref={ref}
            id={id}
            className={`border-slate-800 bg-slate-950 text-white placeholder:text-slate-600 ${
              rightElement ? "pr-10" : ""
            } ${
              validationState === "valid"
                ? "border-emerald-500/50"
                : validationState === "invalid"
                  ? "border-rose-500/50"
                  : ""
            } ${className ?? ""}`}
            {...inputProps}
          />
          {rightElement && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
              {rightElement}
            </div>
          )}
          {validationState !== "idle" && !rightElement && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
              {validationState === "valid" ? (
                <CheckCircle className="h-4 w-4 animate-validation-in text-emerald-400" />
              ) : (
                <AlertCircle className="h-4 w-4 animate-validation-in text-rose-400" />
              )}
            </div>
          )}
        </div>
        {hint && !validationMessage && (
          <p className="text-[10px] text-slate-600">{hint}</p>
        )}
        {validationMessage && (
          <p
            className={`animate-validation-in text-[10px] ${
              validationState === "invalid"
                ? "text-rose-400"
                : "text-emerald-400"
            }`}
          >
            {validationMessage}
          </p>
        )}
      </div>
    );
  }
);
