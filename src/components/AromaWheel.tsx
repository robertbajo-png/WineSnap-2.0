import { cn } from "@/lib/utils";

/**
 * Aroma Wheel — 6 family sectors with sub-category and leaf rings.
 * Inspired by the classic wine aroma wheel.
 */

type Family = {
  name: string;
  color: string; // base oklch
  /** Subcategories with leaf aromas. Sum of weights = 1 within a family. */
  subs: { name: string; weight: number; leaves: string[] }[];
};

const FAMILIES: Family[] = [
  {
    name: "Fruit",
    color: "oklch(0.38 0.13 20)",
    subs: [
      { name: "Dark fruit", weight: 0.5, leaves: ["Black cherry", "Plum", "Blueberry"] },
      { name: "Red fruit", weight: 0.5, leaves: ["Raspberry", "Red currant"] },
    ],
  },
  {
    name: "Floral",
    color: "oklch(0.34 0.07 300)",
    subs: [
      { name: "Floral", weight: 1, leaves: ["Violet", "Rose", "Lavender", "Hibiscus", "Peony"] },
    ],
  },
  {
    name: "Spice",
    color: "oklch(0.42 0.11 55)",
    subs: [
      { name: "Warm spice", weight: 0.6, leaves: ["Black pepper", "Clove", "Cinnamon"] },
      { name: "Sweet spice", weight: 0.4, leaves: ["Nutmeg", "Anise"] },
    ],
  },
  {
    name: "Oak",
    color: "oklch(0.5 0.12 80)",
    subs: [
      { name: "Oak", weight: 1, leaves: ["Cedar", "Vanilla", "Coconut", "Toanut"] },
    ],
  },
  {
    name: "Earth",
    color: "oklch(0.38 0.07 130)",
    subs: [
      { name: "Vegetal", weight: 1, leaves: ["Forest floor", "Truffle", "Mushroom", "Tobacco leaf"] },
    ],
  },
  {
    name: "Mineral",
    color: "oklch(0.34 0.04 230)",
    subs: [
      { name: "Stone", weight: 0.55, leaves: ["Wet stone", "Slate", "Gravel", "Talc"] },
      { name: "Marine", weight: 0.45, leaves: ["Sea breeze"] },
    ],
  },
];

function shift(color: string, dL: number, dC = 0): string {
  return color.replace(/oklch\(([^)]+)\)/, (_, p) => {
    const parts = p.trim().split(/\s+/);
    const l = parseFloat(parts[0]);
    const c = parseFloat(parts[1]);
    const h = parts[2];
    return `oklch(${(l + dL).toFixed(3)} ${(c + dC).toFixed(3)} ${h})`;
  });
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, rA: number, rB: number, a0: number, a1: number) {
  const p0 = polar(cx, cy, rB, a0);
  const p1 = polar(cx, cy, rB, a1);
  const p2 = polar(cx, cy, rA, a1);
  const p3 = polar(cx, cy, rA, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${p0.x},${p0.y} A${rB},${rB} 0 ${large} 1 ${p1.x},${p1.y} L${p2.x},${p2.y} A${rA},${rA} 0 ${large} 0 ${p3.x},${p3.y} Z`;
}

/** Path along the centerline of an arc (for textPath). */
function centerlineArc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${p0.x},${p0.y} A${r},${r} 0 ${large} 1 ${p1.x},${p1.y}`;
}

export const AROMA_FAMILIES = FAMILIES.map((f) => f.name);

export function AromaWheel({
  size = 220,
  className,
  showLabels,
  selectedFamily,
  onSelectFamily,
  onSelectCenter,
  centerActive,
}: {
  size?: number;
  className?: string;
  showLabels?: boolean;
  selectedFamily?: string | null;
  onSelectFamily?: (family: string | null) => void;
  onSelectCenter?: () => void;
  centerActive?: boolean;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const pad = Math.max(2, size * 0.018);
  const rOuter = size / 2 - pad;
  const rMid = rOuter * 0.7;
  const rInner = rOuter * 0.42;
  const rCore = rInner * 0.45;

  const labels = showLabels ?? size >= 320;
  const stroke = "oklch(0.12 0.008 30)";
  const goldRim = "oklch(0.78 0.13 75 / 0.55)";
  const interactive = !!onSelectFamily;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className}>
      <defs>
        <radialGradient id="aw-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="oklch(0.22 0.02 30)" />
          <stop offset="100%" stopColor="oklch(0.12 0.008 30)" />
        </radialGradient>
        <radialGradient id="aw-glow" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="oklch(0.78 0.13 75 / 0)" />
          <stop offset="100%" stopColor="oklch(0.78 0.13 75 / 0.18)" />
        </radialGradient>
      </defs>

      {/* outer glow halo */}
      <circle cx={cx} cy={cy} r={rOuter} fill="url(#aw-glow)" />

      {(() => {
        const groups: React.ReactNode[] = [];
        const textPaths: React.ReactNode[] = [];
        FAMILIES.forEach((fam, fi) => {
          const famStart = fi * 60;
          const famEnd = famStart + 60;
          const famElems: React.ReactNode[] = [];
          const isSelected = selectedFamily === fam.name;
          const dim = !!selectedFamily && !isSelected;

          famElems.push(
            <path
              key={`fam-${fi}`}
              d={arcPath(cx, cy, rInner, rMid, famStart, famEnd)}
              fill={fam.color}
              stroke={stroke}
              strokeWidth={1}
            />,
          );

          let subAngle = famStart;
          fam.subs.forEach((sub, si) => {
            const subEnd = subAngle + 60 * sub.weight;
            const midColor = shift(fam.color, 0.06);
            famElems.push(
              <path
                key={`sub-${fi}-${si}`}
                d={arcPath(cx, cy, rMid, rOuter * 0.78, subAngle, subEnd)}
                fill={midColor}
                stroke={stroke}
                strokeWidth={1}
              />,
            );

            if (labels && sub.name && size >= 280) {
              const r = (rMid + rOuter * 0.78) / 2;
              const mid = (subAngle + subEnd) / 2;
              const flip = mid > 90 && mid < 270;
              const a0 = flip ? subEnd - 1 : subAngle + 1;
              const a1 = flip ? subAngle + 1 : subEnd - 1;
              const id = `sub-tp-${fi}-${si}`;
              textPaths.push(<path key={`p-${id}`} id={id} d={centerlineArc(cx, cy, r, a0, a1)} fill="none" />);
              famElems.push(
                <text key={`t-${id}`} fontSize={size * 0.024} className="fill-cream/85 font-display pointer-events-none">
                  <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">{sub.name}</textPath>
                </text>,
              );
            }

            const leafSpan = (subEnd - subAngle) / sub.leaves.length;
            sub.leaves.forEach((leaf, li) => {
              const lStart = subAngle + li * leafSpan;
              const lEnd = lStart + leafSpan;
              const leafColor = shift(fam.color, 0.12);
              famElems.push(
                <path
                  key={`leaf-${fi}-${si}-${li}`}
                  d={arcPath(cx, cy, rOuter * 0.78, rOuter, lStart, lEnd)}
                  fill={leafColor}
                  stroke={stroke}
                  strokeWidth={0.8}
                />,
              );

              if (labels && size >= 280) {
                const r = (rOuter * 0.78 + rOuter) / 2;
                const mid = (lStart + lEnd) / 2;
                const flip = mid > 90 && mid < 270;
                const a0 = flip ? lEnd - 0.5 : lStart + 0.5;
                const a1 = flip ? lStart + 0.5 : lEnd - 0.5;
                const id = `leaf-tp-${fi}-${si}-${li}`;
                textPaths.push(<path key={`p-${id}`} id={id} d={centerlineArc(cx, cy, r, a0, a1)} fill="none" />);
                famElems.push(
                  <text key={`t-${id}`} fontSize={size * 0.021} className="fill-cream/75 font-display pointer-events-none">
                    <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">{leaf}</textPath>
                  </text>,
                );
              }
            });

            subAngle = subEnd;
          });

          if (labels && size >= 220) {
            const mid = famStart + 30;
            const r = (rInner + rMid) / 2;
            const p = polar(cx, cy, r, mid);
            famElems.push(
              <text
                key={`fname-${fi}`}
                x={p.x}
                y={p.y + size * 0.012}
                textAnchor="middle"
                fontSize={size * 0.034}
                className="fill-cream font-display pointer-events-none"
              >
                {fam.name}
              </text>,
            );
          }

          if (isSelected) {
            famElems.push(
              <path
                key={`hl-${fi}`}
                d={arcPath(cx, cy, rInner - 1, rOuter + 1, famStart, famEnd)}
                fill="none"
                stroke="oklch(0.85 0.16 75)"
                strokeWidth={1.6}
                className="pointer-events-none"
              />,
            );
          }

          groups.push(
            <g
              key={`g-${fi}`}
              onClick={interactive ? (e) => { e.stopPropagation(); onSelectFamily?.(isSelected ? null : fam.name); } : undefined}
              style={{
                cursor: interactive ? "pointer" : undefined,
                opacity: dim ? 0.35 : 1,
                transition: "opacity 200ms ease",
              }}
            >
              {famElems}
            </g>,
          );
        });

        return (
          <>
            <defs>{textPaths}</defs>
            {groups}
          </>
        );
      })()}

      {/* gold tick marks on outer rim */}
      {Array.from({ length: 120 }).map((_, i) => {
        const a = (i * 3 - 90) * (Math.PI / 180);
        const r1 = rOuter + pad * 0.2;
        const r2 = rOuter + pad * (i % 10 === 0 ? 0.9 : 0.5);
        const x1 = cx + r1 * Math.cos(a);
        const y1 = cy + r1 * Math.sin(a);
        const x2 = cx + r2 * Math.cos(a);
        const y2 = cy + r2 * Math.sin(a);
        return (
          <line
            key={`tk-${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={goldRim}
            strokeWidth={i % 10 === 0 ? 0.9 : 0.5}
          />
        );
      })}

      {/* outer rim */}
      <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke={goldRim} strokeWidth="1" />

      {/* core disc — click to show this wine's aromas */}
      <g
        onClick={onSelectCenter ? (e) => { e.stopPropagation(); onSelectCenter(); } : undefined}
        style={{ cursor: onSelectCenter ? "pointer" : undefined }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={rCore}
          fill="url(#aw-core)"
          stroke={centerActive ? "oklch(0.85 0.16 75)" : goldRim}
          strokeWidth={centerActive ? 1.8 : 1}
        />
        <text
          x={cx}
          y={cy - size * 0.008}
          textAnchor="middle"
          fontSize={size * 0.038}
          className="fill-gold/90 font-display pointer-events-none"
        >
          THIS WINE
        </text>
        <text
          x={cx}
          y={cy + size * 0.032}
          textAnchor="middle"
          fontSize={size * 0.022}
          className="fill-cream/60 font-display pointer-events-none"
          style={{ letterSpacing: "0.1em" }}
        >
          {centerActive ? "showing" : "tap to show"}
        </text>
      </g>
    </svg>
  );
}

export function AromaSlider({ name, value }: { name: string; value: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn("h-1.5 w-1.5 rounded-full", i <= value ? "bg-burgundy" : "bg-white/15")}
        />
      ))}
      <span className="sr-only">{name}</span>
    </div>
  );
}
