"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { motion, useReducedMotion } from "framer-motion"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, checked, defaultChecked, onCheckedChange, ...props }, ref) => {
  const prefersReducedMotion = useReducedMotion()
  const [localChecked, setLocalChecked] = React.useState(defaultChecked ?? false)
  const isControlled = checked !== undefined
  const resolvedChecked = isControlled ? checked : localChecked

  const handleCheckedChange = React.useCallback(
    (value: boolean) => {
      if (!isControlled) {
        setLocalChecked(value)
      }
      onCheckedChange?.(value)
    },
    [onCheckedChange, isControlled]
  )

  return (
    <SwitchPrimitives.Root
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className
      )}
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={handleCheckedChange}
      {...props}
      ref={ref}
    >
      <motion.span
        className="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0"
        animate={{ x: resolvedChecked ? 20 : 0 }}
        transition={
          prefersReducedMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 500, damping: 30 }
        }
      />
    </SwitchPrimitives.Root>
  )
})
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
