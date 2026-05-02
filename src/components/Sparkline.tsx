export function Sparkline({ className }: { className?: string }) {
  const points = [10, 14, 11, 16, 14, 20, 18, 24, 22, 28, 32, 36];
  const w = 100;
  const h = 40;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / (max - min)) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none">
      <defs>
        <linearGradient id="sl" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.78 0.13 75)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="oklch(0.78 0.13 75)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${w},${h} L0,${h} Z`} fill="url(#sl)" />
      <path d={path} fill="none" stroke="oklch(0.78 0.13 75)" strokeWidth="1.5" />
    </svg>
  );
}
