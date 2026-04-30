import { cn } from "@/lib/utils";

export function MeterRow({
  label,
  value,
  max = 10,
  hint,
}: {
  label: string;
  value: number | null | undefined;
  max?: number;
  hint?: string;
}) {
  const v = value ?? 0;
  const pct = Math.max(0, Math.min(100, (v / max) * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="font-display text-sm tabular-nums text-muted-foreground">
          {value == null ? "—" : `${v.toFixed(1)}`}
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("absolute inset-y-0 left-0 bg-gradient-wine")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
