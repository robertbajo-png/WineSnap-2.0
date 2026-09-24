import { cn } from "@/lib/utils";

const WHEEL_SEGMENTS = [
  { label: "Red fruit", color: "oklch(0.50 0.18 18)", accent: "oklch(0.72 0.15 24)" },
  { label: "Black fruit", color: "oklch(0.38 0.16 350)", accent: "oklch(0.60 0.14 355)" },
  { label: "Citrus", color: "oklch(0.74 0.13 78)", accent: "oklch(0.86 0.12 84)" },
  { label: "Stone", color: "oklch(0.66 0.13 58)", accent: "oklch(0.82 0.11 62)" },
  { label: "Floral", color: "oklch(0.56 0.12 325)", accent: "oklch(0.76 0.10 330)" },
  { label: "Herbal", color: "oklch(0.42 0.10 142)", accent: "oklch(0.64 0.10 145)" },
  { label: "Mineral", color: "oklch(0.42 0.05 220)", accent: "oklch(0.68 0.05 215)" },
  { label: "Earth", color: "oklch(0.36 0.05 62)", accent: "oklch(0.58 0.06 66)" },
  { label: "Oak", color: "oklch(0.46 0.09 48)", accent: "oklch(0.70 0.11 55)" },
  { label: "Spice", color: "oklch(0.50 0.14 32)", accent: "oklch(0.72 0.13 38)" },
  { label: "Sweet", color: "oklch(0.58 0.12 82)", accent: "oklch(0.78 0.11 88)" },
  { label: "Roast", color: "oklch(0.35 0.07 38)", accent: "oklch(0.58 0.08 44)" },
];

export function AromaWheel({
  size = 220,
  className,
  highlight = [],
}: {
  size?: number;
  className?: string;
  highlight?: number[];
}) {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 5;
  const rMid = rOuter * 0.72;
  const rInner = rOuter * 0.39;
  const labelRadius = (rOuter + rMid) / 2;

  const segmentPath = (i: number, rA: number, rB: number) => {
    const step = 360 / WHEEL_SEGMENTS.length;
    const a0 = (i * step - 90) * (Math.PI / 180);
    const a1 = ((i + 1) * step - 90) * (Math.PI / 180);
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

  const labelPosition = (i: number) => {
    const step = 360 / WHEEL_SEGMENTS.length;
    const angle = (i * step + step / 2 - 90) * (Math.PI / 180);
    return {
      x: cx + labelRadius * Math.cos(angle),
      y: cy + labelRadius * Math.sin(angle),
      rotate: i * step + step / 2,
    };
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn("drop-shadow-[0_18px_38px_oklch(0_0_0/0.42)]", className)}>
      <defs>
        <filter id="aroma-wheel-soft-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0.75 0 1 0 0 0.38 0 0 1 0 0.16 0 0 0 0.35 0" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="aroma-wheel-core" cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor="oklch(0.35 0.08 24)" />
          <stop offset="56%" stopColor="oklch(0.20 0.02 30)" />
          <stop offset="100%" stopColor="oklch(0.11 0.008 30)" />
        </radialGradient>
      </defs>

      <circle cx={cx} cy={cy} r={rOuter + 1} fill="oklch(0.08 0.006 30)" />
      <circle cx={cx} cy={cy} r={rOuter + 0.5} fill="none" stroke="oklch(0.78 0.13 75 / 0.24)" strokeWidth="1" />

      {WHEEL_SEGMENTS.map((segment, i) => {
        const active = highlight.length === 0 || highlight.includes(i);
        return (
          <g key={segment.label} opacity={active ? 1 : 0.34}>
            <path
              d={segmentPath(i, rMid, rOuter)}
              fill={segment.color}
              stroke="oklch(0.08 0.006 30)"
              strokeWidth="1.4"
            />
            <path
              d={segmentPath(i, rInner, rMid)}
              fill={segment.accent}
              stroke="oklch(0.08 0.006 30)"
              strokeWidth="1.4"
            />
            <path
              d={segmentPath(i, rOuter * 0.93, rOuter)}
              fill="oklch(1 0 0 / 0.08)"
            />
          </g>
        );
      })}

      {WHEEL_SEGMENTS.map((segment, i) => {
        const pos = labelPosition(i);
        const rotate = pos.rotate > 90 && pos.rotate < 270 ? pos.rotate + 180 : pos.rotate;
        return (
          <text
            key={`${segment.label}-label`}
            x={pos.x}
            y={pos.y}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(${rotate} ${pos.x} ${pos.y})`}
            fontSize={size < 180 ? 5.5 : 7}
            letterSpacing="0.08em"
            fill="oklch(0.96 0.03 80 / 0.70)"
            className="select-none uppercase"
          >
            {segment.label}
          </text>
        );
      })}

      <circle cx={cx} cy={cy} r={rInner + 1} fill="oklch(0.08 0.006 30 / 0.72)" />
      <circle cx={cx} cy={cy} r={rInner} fill="url(#aroma-wheel-core)" stroke="oklch(0.78 0.13 75 / 0.34)" strokeWidth="1" filter="url(#aroma-wheel-soft-glow)" />
      <circle cx={cx} cy={cy} r={rInner * 0.56} fill="none" stroke="oklch(0.78 0.13 75 / 0.20)" strokeWidth="1" />
      <text x={cx} y={cy - 2} textAnchor="middle" className="fill-cream font-display" fontSize={size < 180 ? 12 : 15}>
        Aroma
      </text>
      <text x={cx} y={cy + 11} textAnchor="middle" fontSize={size < 180 ? 5.5 : 7} letterSpacing="0.18em" fill="oklch(0.78 0.13 75 / 0.72)">
        WHEEL
      </text>
    </svg>
  );
}

export function AromaSlider({ name, value }: { name: string; value: number }) {
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
