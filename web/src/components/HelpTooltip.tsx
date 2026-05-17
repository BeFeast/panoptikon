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
          className="inline-flex items-center justify-center rounded-full text-mesh-text-mute hover:text-mesh-text transition-colors"
          aria-label="Help"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        className="max-w-xs border-mesh-border bg-mesh-surface-1 text-mesh-text"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
