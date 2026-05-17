import { cn } from "@/lib/utils";

interface BrandMarkProps {
  /** Width and height in pixels. SVG scales proportionally. */
  size?: number;
  className?: string;
  title?: string;
}

export function BrandMark({ size = 32, className, title = "Panoptikon" }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-label={title}
      role="img"
      data-testid="brand-mark"
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M48 48 24 24M48 48l27-30M48 48l20 28M48 48 20 24"
          strokeWidth="2.25"
        />
        <path
          d="M24 24h34l17-6M20 72h42l6 4"
          strokeWidth="1.25"
          strokeDasharray="4 7"
          opacity="0.34"
        />
      </g>
      <circle cx="48" cy="48" r="8.5" fill="#0b1f3d" stroke="currentColor" strokeWidth="2.25" />
      <circle cx="48" cy="48" r="2.75" fill="#67e8f9" />
      <circle cx="24" cy="24" r="5.5" fill="#071326" stroke="currentColor" strokeWidth="2.25" />
      <circle cx="75" cy="18" r="5" fill="#071326" stroke="currentColor" strokeWidth="2.25" />
      <circle cx="68" cy="76" r="5.5" fill="#071326" stroke="currentColor" strokeWidth="2.25" />
      <circle cx="20" cy="72" r="5" fill="#071326" stroke="currentColor" strokeWidth="2.25" />
    </svg>
  );
}
