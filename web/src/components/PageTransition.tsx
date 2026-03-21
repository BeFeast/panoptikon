'use client'

import { motion, useReducedMotion } from 'framer-motion'

const containerVariants = {
  hidden: { opacity: 0, filter: 'blur(2px)' },
  visible: {
    opacity: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.18,
      ease: 'easeOut',
      staggerChildren: 0.05,
    },
  },
}

const reducedMotionContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0 },
  },
}

export const staggerChildVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.18, ease: 'easeOut' },
  },
}

const reducedMotionChildVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0 },
  },
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <motion.div
      variants={prefersReducedMotion ? reducedMotionContainerVariants : containerVariants}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  )
}

export function StaggerChild({ children, className }: { children: React.ReactNode; className?: string }) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <motion.div
      variants={prefersReducedMotion ? reducedMotionChildVariants : staggerChildVariants}
      className={className}
    >
      {children}
    </motion.div>
  )
}
