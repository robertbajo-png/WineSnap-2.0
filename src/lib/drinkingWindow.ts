// Heuristic drinking window calculation based on wine type and vintage.
// Not sommelier-perfect, but a sensible default per style category.

export type DrinkingWindow = {
  start: number;
  peak: number;
  end: number;
  status: "too-young" | "great-now" | "past-peak";
  yearsToPeak: number;
};

const AGING: Record<string, { start: number; peak: number; end: number }> = {
  red:        { start: 2, peak: 6,  end: 15 },
  white:      { start: 1, peak: 3,  end: 7  },
  rose:       { start: 0, peak: 1,  end: 3  },
  sparkling:  { start: 0, peak: 2,  end: 6  },
  dessert:    { start: 3, peak: 10, end: 25 },
  fortified:  { start: 5, peak: 15, end: 40 },
};

export function computeDrinkingWindow(
  vintage: number | null | undefined,
  wineType: string | null | undefined,
  now: number = new Date().getFullYear(),
): DrinkingWindow | null {
  if (!vintage) return null;
  const key = (wineType ?? "red").toLowerCase();
  const cfg = AGING[key] ?? AGING.red;
  const start = vintage + cfg.start;
  const peak = vintage + cfg.peak;
  const end = vintage + cfg.end;
  const status = now < start ? "too-young" : now > end ? "past-peak" : "great-now";
  return { start, peak, end, status, yearsToPeak: peak - now };
}
