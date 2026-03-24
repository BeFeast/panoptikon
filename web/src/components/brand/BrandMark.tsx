import { cn } from "@/lib/utils";

interface BrandMarkProps {
  /** Width and height in pixels. SVG scales proportionally. */
  size?: number;
  className?: string;
}

export function BrandMark({ size = 32, className }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-label="Panoptikon"
      role="img"
    >
      <g strokeLinecap="round" strokeLinejoin="round">
        {/* Outer broken hex ring — signal cyan */}
        <path
          d="M57 87L128 46L199 87L199 169"
          stroke="#22D3EE"
          strokeWidth="14"
        />
        <path
          d="M180 188L128 218L76 188"
          stroke="#22D3EE"
          strokeWidth="14"
        />
        <path d="M57 169L57 87" stroke="#22D3EE" strokeWidth="14" />
        {/* Inner hex — cloud white */}
        <path
          d="M87 104L128 80L169 104L169 152L128 176L87 152Z"
          stroke="#E8EEF7"
          strokeOpacity="0.92"
          strokeWidth="10"
        />
        {/* Connector spoke — amber accent */}
        <path d="M169 104L186 94" stroke="#F59E0B" strokeWidth="10" />
      </g>
      {/* Central node — amber */}
      <circle cx="128" cy="128" r="13" fill="#F59E0B" />
    </svg>
  );
}
