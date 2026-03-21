"use client";

import { useEffect, useState } from "react";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

type SaveStatus = "idle" | "loading" | "success" | "error";

interface AnimatedSaveButtonProps {
  status: SaveStatus;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  label?: string;
  className?: string;
}

export function AnimatedSaveButton({
  status,
  disabled,
  onClick,
  type = "button",
  label = "Save",
  className,
}: AnimatedSaveButtonProps) {
  const [showCheck, setShowCheck] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (status === "success") {
      setShowCheck(true);
      const t = setTimeout(() => setShowCheck(false), 2000);
      return () => clearTimeout(t);
    }
  }, [status]);

  useEffect(() => {
    if (status === "error") {
      setShake(true);
      const t = setTimeout(() => setShake(false), 500);
      return () => clearTimeout(t);
    }
  }, [status]);

  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`relative transition-all duration-300 ${
        showCheck
          ? "bg-emerald-600 text-white shadow-[0_0_12px_rgba(16,185,129,0.4)] hover:bg-emerald-500"
          : status === "error"
            ? "bg-rose-600 text-white hover:bg-rose-500"
            : "bg-blue-600 text-white hover:bg-blue-500"
      } disabled:opacity-40 ${shake ? "animate-shake" : ""} ${className ?? ""}`}
    >
      {status === "loading" ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : showCheck ? (
        <Check className="mr-1.5 h-3.5 w-3.5 animate-validation-in" />
      ) : null}
      {showCheck ? "Saved" : label}
    </Button>
  );
}
