"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Friendly error state with a retry button.
 * Replaces raw error text with an icon, message, and action.
 */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-[#fb7185]/20 bg-[#fb7185]/5 px-5 py-12 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md border border-[#fb7185]/30 bg-mesh-surface-1">
        <AlertCircle className="h-5 w-5 text-[#fb7185]" />
      </div>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-mesh-text">Something went wrong</p>
      <p className="mt-2 max-w-sm text-sm text-[#fb7185]/80">{message}</p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          className="mt-5 border-mesh-border bg-mesh-surface-1 text-mesh-text hover:bg-mesh-surface-2 hover:text-white"
          onClick={onRetry}
        >
          Try again
        </Button>
      )}
    </div>
  );
}
