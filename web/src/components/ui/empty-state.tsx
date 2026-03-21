import type { LucideIcon } from "lucide-react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ─── Empty State ────────────────────────────────────── */

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-800/60">
        <Icon className="h-8 w-8 text-slate-500" />
      </div>
      <p className="text-lg font-medium text-slate-400">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-600">{description}</p>
      {actionLabel && onAction && (
        <Button
          variant="outline"
          className="mt-4 border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

/* ─── Error State ────────────────────────────────────── */

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  message = "Something went wrong",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/10">
        <AlertCircle className="h-8 w-8 text-rose-400" />
      </div>
      <p className="text-lg font-medium text-slate-400">{message}</p>
      {onRetry && (
        <Button
          variant="outline"
          className="mt-4 border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={onRetry}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      )}
    </div>
  );
}
