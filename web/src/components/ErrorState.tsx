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
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertCircle className="mb-4 h-12 w-12 text-rose-500/60" />
      <p className="text-lg font-medium text-slate-400">Something went wrong</p>
      <p className="mt-1 max-w-sm text-sm text-rose-400/80">{message}</p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          className="mt-5 border-slate-700 text-slate-400 hover:text-white"
          onClick={onRetry}
        >
          Try again
        </Button>
      )}
    </div>
  );
}
