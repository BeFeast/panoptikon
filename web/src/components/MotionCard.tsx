'use client'

import { motion } from 'framer-motion'

/**
 * Wraps a card element with subtle hover elevation.
 * Animates only transform for GPU-accelerated performance.
 */
export function MotionCard({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={className}
      onClick={onClick}
      style={{ willChange: 'transform' }}
    >
      {children}
    </motion.div>
  )
}
