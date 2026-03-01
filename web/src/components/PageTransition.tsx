'use client'

import { motion, useReducedMotion } from 'framer-motion'

export function PageTransition({ children }: { children: React.ReactNode }) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.18, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}
