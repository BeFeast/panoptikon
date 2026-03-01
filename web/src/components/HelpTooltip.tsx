"use client";

import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Small (?) icon that shows a tooltip on hover.
 * Used next to section titles to explain what a section does.
 */
export function HelpTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full text-slate-500 hover:text-slate-300 transition-colors"
          aria-label="Help"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        className="max-w-xs border-slate-700 bg-slate-800 text-slate-200"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
