/**
 * Radar/spider chart för smakprofil. Pure SVG, inga deps.
 * Värden 0-10. Axlar listas medurs från toppen.
 */
export function RadarChart({
  axes,
  size = 220,
  max = 10,
}: {
  axes: { label: string; value: number | null | undefined }[];
  size?: number;
  max?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 32;
  const n = axes.length;

  const point = (i: number, val: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const dist = (Math.max(0, Math.min(max, val)) / max) * r;
    return [cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist] as const;
  };

  const labelPoint = (i: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(angle) * (r + 16), cy + Math.sin(angle) * (r + 16)] as const;
  };

  const polygon = axes
    .map((a, i) => point(i, a.value ?? 0).join(","))
    .join(" ");

  const grids = [0.25, 0.5, 0.75, 1].map((s) => {
    const pts = Array.from({ length: n })
      .map((_, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        return `${cx + Math.cos(angle) * r * s},${cy + Math.sin(angle) * r * s}`;
      })
      .join(" ");
    return pts;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
      {grids.map((p, i) => (
        <polygon
          key={i}
          points={p}
          fill="none"
          stroke="oklch(1 0 0 / 0.08)"
          strokeWidth={1}
        />
      ))}
      {axes.map((_, i) => {
        const [x, y] = point(i, max);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="oklch(1 0 0 / 0.06)"
            strokeWidth={1}
          />
        );
      })}
      <polygon
        points={polygon}
        fill="oklch(0.5 0.18 18 / 0.45)"
        stroke="oklch(0.78 0.13 75)"
        strokeWidth={1.5}
      />
      {axes.map((a, i) => {
        const [lx, ly] = labelPoint(i);
        return (
          <text
            key={i}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="10"
            fill="oklch(0.7 0.03 60)"
            className="font-sans"
          >
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}
