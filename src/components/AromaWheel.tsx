import { cn } from "@/lib/utils";

/**
 * Aroma Wheel — koncentriska segment av aromfamiljer.
 * Inspirerad av wine aroma wheel.
 */
export function AromaWheel({
  size = 220,
  className,
  highlight = [],
}: {
  size?: number;
  className?: string;
  highlight?: number[]; // index av segment att lyfta
}) {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 4;
  const rMid = rOuter * 0.72;
  const rInner = rOuter * 0.42;

  // 12 segment, varje 30°. Färger som speglar aromfamiljer.
  const segments: { color: string; ring: 0 | 1 }[] = [
    // Ytter ring (mörkare/jordiga)
    { color: "oklch(0.42 0.14 25)", ring: 0 },
    { color: "oklch(0.5 0.14 35)", ring: 0 },
    { color: "oklch(0.58 0.13 55)", ring: 0 },
    { color: "oklch(0.6 0.12 90)", ring: 0 },
    { color: "oklch(0.45 0.1 130)", ring: 0 },
    { color: "oklch(0.38 0.07 160)", ring: 0 },
    { color: "oklch(0.32 0.04 200)", ring: 0 },
    { color: "oklch(0.36 0.06 260)", ring: 0 },
    { color: "oklch(0.42 0.1 320)", ring: 0 },
    { color: "oklch(0.5 0.14 350)", ring: 0 },
    { color: "oklch(0.45 0.16 15)", ring: 0 },
    { color: "oklch(0.4 0.15 18)", ring: 0 },
  ];

  const inner: { color: string }[] = segments.map((s) => ({
    color: s.color.replace(/oklch\(([^)]+)\)/, (_, p) => {
      const [l, c, h] = p.split(/\s+/);
      return `oklch(${(parseFloat(l) + 0.08).toFixed(2)} ${c} ${h})`;
    }),
  }));

  const seg = (i: number, rA: number, rB: number) => {
    const a0 = (i * 30 - 90) * (Math.PI / 180);
    const a1 = ((i + 1) * 30 - 90) * (Math.PI / 180);
    const x0 = cx + rB * Math.cos(a0);
    const y0 = cy + rB * Math.sin(a0);
    const x1 = cx + rB * Math.cos(a1);
    const y1 = cy + rB * Math.sin(a1);
    const x2 = cx + rA * Math.cos(a1);
    const y2 = cy + rA * Math.sin(a1);
    const x3 = cx + rA * Math.cos(a0);
    const y3 = cy + rA * Math.sin(a0);
    return `M${x0},${y0} A${rB},${rB} 0 0 1 ${x1},${y1} L${x2},${y2} A${rA},${rA} 0 0 0 ${x3},${y3} Z`;
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className}>
      {/* outer ring */}
      {segments.map((s, i) => (
        <path
          key={`o${i}`}
          d={seg(i, rMid, rOuter)}
          fill={s.color}
          stroke="oklch(0.13 0.008 30)"
          strokeWidth="1.5"
          opacity={highlight.length === 0 || highlight.includes(i) ? 1 : 0.4}
        />
      ))}
      {/* inner ring */}
      {inner.map((s, i) => (
        <path
          key={`i${i}`}
          d={seg(i, rInner, rMid)}
          fill={s.color}
          stroke="oklch(0.13 0.008 30)"
          strokeWidth="1.5"
          opacity={highlight.length === 0 || highlight.includes(i) ? 1 : 0.4}
        />
      ))}
      {/* center disc */}
      <circle cx={cx} cy={cy} r={rInner} fill="oklch(0.18 0.012 30)" stroke="oklch(0.78 0.13 75 / 0.3)" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={rInner * 0.55} fill="oklch(0.4 0.15 18 / 0.4)" />
      <text x={cx} y={cy + 4} textAnchor="middle" className="fill-cream font-display" fontSize="11">
        Aromas
      </text>
    </svg>
  );
}

export function AromaSlider({ name, value }: { name: string; value: number }) {
  // value 1-4 dots
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            i <= value ? "bg-burgundy" : "bg-white/15",
          )}
        />
      ))}
      <span className="sr-only">{name}</span>
    </div>
  );
}
