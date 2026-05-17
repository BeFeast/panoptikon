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
    <div className="flex flex-col items-center justify-center rounded-md border border-rose-500/20 bg-rose-500/5 px-5 py-12 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md border border-rose-500/30 bg-slate-950">
        <AlertCircle className="h-5 w-5 text-rose-300" />
      </div>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-200">Something went wrong</p>
      <p className="mt-2 max-w-sm text-sm text-rose-300/80">{message}</p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          className="mt-5 border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-900 hover:text-white"
          onClick={onRetry}
        >
          Try again
        </Button>
      )}
    </div>
  );
}
