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
        "bg-mesh-primary text-white hover:bg-mesh-primary disabled:opacity-40 transition-all",
        animating === "success" && "animate-success-glow bg-[#4ade80] hover:bg-[#4ade80]",
        animating === "error" && "animate-shake bg-[#fb7185] hover:bg-[#fb7185]",
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
