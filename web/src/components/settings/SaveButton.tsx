"use client";

import { useEffect, useState } from "react";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SaveStatus = "idle" | "loading" | "success" | "error";

interface SaveButtonProps {
  status: SaveStatus;
  disabled?: boolean;
  onClick: () => void;
  label?: string;
  className?: string;
}

export function SaveButton({
  status,
  disabled,
  onClick,
  label = "Save",
  className,
}: SaveButtonProps) {
  const [animating, setAnimating] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    if (status === "success") {
      setAnimating("success");
      const t = setTimeout(() => setAnimating(null), 800);
      return () => clearTimeout(t);
    }
    if (status === "error") {
      setAnimating("error");
      const t = setTimeout(() => setAnimating(null), 400);
      return () => clearTimeout(t);
    }
  }, [status]);

  return (
    <Button
      onClick={onClick}
      disabled={disabled || status === "loading"}
      className={cn(
        "bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-all",
        animating === "success" && "animate-success-glow bg-emerald-600 hover:bg-emerald-500",
        animating === "error" && "animate-shake bg-rose-600 hover:bg-rose-500",
        className,
      )}
      data-testid="save-button"
    >
      {status === "loading" ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : animating === "success" ? (
        <Check className="mr-1.5 h-3.5 w-3.5 animate-check-scale" />
      ) : null}
      {animating === "success" ? "Saved" : label}
    </Button>
  );
}
