import { cn } from "@/lib/utils";

/**
 * Tasting bar — vänster/höger labels med en guldfärgad indikator längs en linje.
 * Används som "Light ─●── Bold".
 */
export function MeterRow({
  left,
  right,
  value,
  max = 10,
  className,
}: {
  left: string;
  right: string;
  value: number | null | undefined;
  max?: number;
  className?: string;
}) {
  const v = value ?? max / 2;
  const pct = Math.max(2, Math.min(98, (v / max) * 100));
  return (
    <div className={cn("flex items-center gap-3 text-xs", className)}>
      <span className="w-14 shrink-0 text-muted-foreground">{left}</span>
      <div className="relative h-[2px] flex-1 rounded-full bg-white/10">
        <div
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-gold shadow-[0_0_8px_oklch(0.78_0.13_75/0.6)]"
          style={{ left: `${pct}%` }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-muted-foreground">{right}</span>
    </div>
  );
}

/** Enkel horisontell mätare (för smakprofil-aggregat). */
export function BarMeter({
  label,
  value,
  max = 10,
}: {
  label: string;
  value: number | null | undefined;
  max?: number;
}) {
  const v = value ?? 0;
  const pct = Math.max(0, Math.min(100, (v / max) * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-foreground">{label}</span>
        <span className="font-display text-sm tabular-nums text-gold">
          {value == null ? "—" : v.toFixed(1)}
        </span>
      </div>
      <div className="relative h-1 overflow-hidden rounded-full bg-white/8">
        <div className="absolute inset-y-0 left-0 bg-gradient-gold" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
