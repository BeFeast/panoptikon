import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Textarea primitive — mesh-design counterpart of <Input> for multi-line
 * input. Mirrors the Input recipe (border-mesh-border-strong, bg-mesh-surface-1,
 * mesh-accent focus ring) so consumer files can't drift into ad-hoc
 * "border border-mesh-border-strong bg-mesh-surface-1" combos.
 *
 * Use this anywhere PEM blobs, JSON payloads, multi-line notes, etc. are
 * collected. Never paste the recipe inline at the consumer.
 */
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "flex w-full rounded-md border border-mesh-border-strong bg-mesh-surface-1 px-3 py-2 text-sm text-mesh-text placeholder:text-mesh-text-mute ring-offset-background focus-visible:border-mesh-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mesh-accent/30 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
