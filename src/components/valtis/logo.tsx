export function ValtisLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M4 6h6l6 14L22 6h6L18 28h-4L4 6z"
          fill="url(#gold)"
          stroke="oklch(0.78 0.13 85 / 0.6)"
          strokeWidth="0.5"
        />
        <defs>
          <linearGradient id="gold" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="oklch(0.88 0.14 90)" />
            <stop offset="1" stopColor="oklch(0.65 0.12 75)" />
          </linearGradient>
        </defs>
      </svg>
      <span className="font-display text-xl font-semibold tracking-[0.2em] text-foreground">
        VALTIS
      </span>
    </div>
  );
}