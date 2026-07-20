import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/i18n";
import { WorldMap } from "@/components/WorldMap";

export const Route = createFileRoute("/cellar/overview")({
  head: () => ({
    meta: [
      { title: "Cellar Overview — WineSnap" },
      { name: "description", content: "Value, consumption, regions and varietals across your cellar." },
    ],
  }),
  component: CellarOverviewPage,
});

type WineRow = {
  region: string | null;
  country: string | null;
  grape_varieties: string[] | null;
  vintage: number | null;
  wine_type: string | null;
  user_rating: number | null;
  purchase_price: number | null;
  purchase_currency: string | null;
  purchased_at: string | null;
  consumed_at: string | null;
  quantity: number | null;
  created_at: string;
};

const PALETTE = [
  "oklch(0.5 0.18 18)",
  "oklch(0.4 0.16 30)",
  "oklch(0.62 0.14 50)",
  "oklch(0.45 0.1 130)",
  "oklch(0.32 0.04 200)",
];

const TYPE_COLORS: Record<string, string> = {
  red: "oklch(0.42 0.16 20)",
  white: "oklch(0.82 0.08 90)",
  rose: "oklch(0.72 0.13 15)",
  sparkling: "oklch(0.78 0.08 80)",
  dessert: "oklch(0.65 0.15 60)",
  fortified: "oklch(0.4 0.14 40)",
};

function CellarOverviewPage() {
  const { user } = useAuth();
  const t = useT();
  const [wines, setWines] = useState<WineRow[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("wines")
      .select(
        "region,country,grape_varieties,vintage,wine_type,user_rating,purchase_price,purchase_currency,purchased_at,consumed_at,quantity,created_at",
      )
      .eq("user_id", user.id)
      .then(({ data }) => setWines((data as WineRow[]) ?? []));
  }, [user]);

  const active = wines.filter((w) => !w.consumed_at);
  const consumed = wines.filter((w) => w.consumed_at);
  const bottles = active.reduce((sum, w) => sum + (w.quantity ?? 1), 0);
  const bottlesConsumed = consumed.reduce((sum, w) => sum + (w.quantity ?? 1), 0);
  const regions = new Set(wines.map((w) => w.region).filter(Boolean)).size;
  const countries = new Set(wines.map((w) => w.country).filter(Boolean)).size;

  const priced = active.filter((w) => w.purchase_price != null);
  const totalValue = priced.reduce((s, w) => s + Number(w.purchase_price ?? 0) * (w.quantity ?? 1), 0);
  const avgBottle = priced.length ? totalValue / priced.reduce((s, w) => s + (w.quantity ?? 1), 0) : 0;
  const currency =
    priced.find((w) => w.purchase_currency)?.purchase_currency?.toUpperCase() ?? "SEK";

  const now = new Date().getFullYear();
  const pastPeak = active.filter((w) => w.vintage && w.vintage < now - 6).reduce((s, w) => s + (w.quantity ?? 1), 0);
  const greatNow = active.filter((w) => w.vintage && w.vintage >= now - 6 && w.vintage <= now - 1).reduce((s, w) => s + (w.quantity ?? 1), 0);
  const cellarWorthy = active.filter((w) => w.vintage && w.vintage >= now).reduce((s, w) => s + (w.quantity ?? 1), 0);

  const regionStats = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of active) {
      const key = w.region || w.country;
      if (!key) continue;
      m.set(key, (m.get(key) ?? 0) + (w.quantity ?? 1));
    }
    const arr = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const top = arr.slice(0, 4);
    const otherCount = arr.slice(4).reduce((acc, [, c]) => acc + c, 0);
    if (otherCount > 0) top.push(["Others", otherCount]);
    return top.map(([label, count]) => ({
      label,
      count,
      pct: bottles ? Math.round((count / bottles) * 100) : 0,
    }));
  }, [active, bottles]);

  const varietalStats = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of active) {
      for (const g of w.grape_varieties ?? []) {
        if (!g) continue;
        m.set(g, (m.get(g) ?? 0) + (w.quantity ?? 1));
      }
    }
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, pct: total ? Math.round((count / total) * 100) : 0 }));
  }, [active]);

  const typeStats = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of active) {
      const k = w.wine_type ?? "unknown";
      m.set(k, (m.get(k) ?? 0) + (w.quantity ?? 1));
    }
    const total = [...m.values()].reduce((a, b) => a + b, 0) || 1;
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count, pct: Math.round((count / total) * 100) }));
  }, [active]);

  const vintageStats = useMemo(() => {
    const withV = active.filter((w) => w.vintage);
    if (!withV.length) return [] as { year: number; count: number }[];
    const years = withV.map((w) => w.vintage!);
    const min = Math.min(...years);
    const max = Math.max(...years);
    const buckets: { year: number; count: number }[] = [];
    for (let y = min; y <= max; y++) buckets.push({ year: y, count: 0 });
    for (const w of withV) {
      const b = buckets.find((x) => x.year === w.vintage);
      if (b) b.count += w.quantity ?? 1;
    }
    return buckets;
  }, [active]);

  const ratingStats = useMemo(() => {
    const buckets = [0, 0, 0, 0, 0];
    let rated = 0;
    let sum = 0;
    for (const w of wines) {
      if (w.user_rating == null) continue;
      const idx = Math.min(4, Math.max(0, Math.round(w.user_rating) - 1));
      buckets[idx] += 1;
      rated += 1;
      sum += Number(w.user_rating);
    }
    return { buckets, rated, avg: rated ? sum / rated : 0 };
  }, [wines]);

  const growthStats = useMemo(() => {
    if (!wines.length) return [] as { label: string; total: number }[];
    const sorted = [...wines].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const byMonth = new Map<string, number>();
    for (const w of sorted) {
      const d = new Date(w.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + (w.quantity ?? 1));
    }
    const keys = [...byMonth.keys()].sort();
    // Show last 8 months, cumulative
    const tail = keys.slice(-8);
    let acc = keys.slice(0, keys.length - tail.length).reduce((s, k) => s + (byMonth.get(k) ?? 0), 0);
    return tail.map((k) => {
      acc += byMonth.get(k) ?? 0;
      const [, mm] = k.split("-");
      return { label: mm, total: acc };
    });
  }, [wines]);

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        <header className="flex items-center justify-between">
          <button onClick={() => window.history.back()} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-display text-xl text-gold">{t("overview.title")}</h1>
          <span className="h-9 w-9" />
        </header>

        <section className="mt-5 grid grid-cols-3 gap-2">
          <Stat value={String(bottles)} label={t("overview.bottles")} />
          <Stat value={String(regions)} label={t("overview.regions")} />
          <Stat value={String(countries)} label={t("overview.countries")} />
        </section>

        {(priced.length > 0 || bottlesConsumed > 0) && (
          <section className="mt-4 grid grid-cols-2 gap-2">
            <BigStat
              value={priced.length ? formatMoney(totalValue, currency) : "—"}
              label={t("overview.totalValue")}
              sub={priced.length ? `${priced.length} ${t("overview.priced")}` : t("overview.addPrices")}
            />
            <BigStat
              value={priced.length ? formatMoney(avgBottle, currency) : "—"}
              label={t("overview.avgBottle")}
            />
            <BigStat value={String(bottlesConsumed)} label={t("overview.consumed")} />
            <BigStat
              value={ratingStats.rated ? ratingStats.avg.toFixed(1) : "—"}
              label={t("overview.avgRating")}
              sub={ratingStats.rated ? `${ratingStats.rated} ${t("overview.rated")}` : ""}
            />
          </section>
        )}

        {typeStats.length > 0 && (
          <section className="mt-6">
            <h2 className="font-display text-base text-cream">{t("overview.byType")}</h2>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full border border-white/10">
              {typeStats.map((s) => (
                <div
                  key={s.type}
                  style={{ width: `${s.pct}%`, background: TYPE_COLORS[s.type] ?? "oklch(0.4 0.02 60)" }}
                  title={`${s.type} ${s.pct}%`}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {typeStats.map((s) => (
                <span key={s.type} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[s.type] ?? "oklch(0.4 0.02 60)" }} />
                  <span className="capitalize text-foreground/85">{s.type}</span>
                  <span>{s.count}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {regionStats.length > 0 && (
          <section className="mt-6">
            <h2 className="font-display text-base text-cream">{t("overview.byRegion")}</h2>
            <div className="mt-3 flex items-center gap-4">
              <DonutChart segments={regionStats.map((r) => r.pct)} colors={PALETTE} size={130} />
              <div className="flex-1 space-y-2 text-xs">
                {regionStats.map((r, i) => (
                  <div key={r.label} className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span className="flex-1 truncate text-foreground/85">{r.label}</span>
                    <span className="text-muted-foreground">{r.pct}%</span>
                    <span className="w-10 text-right font-display text-cream">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {active.length > 0 && (
          <section className="mt-7">
            <h2 className="font-display text-base text-cream">World map</h2>
            <WorldMap
              points={active.map((w) => ({
                region: w.region,
                country: w.country,
                count: w.quantity ?? 1,
              }))}
            />
          </section>
        )}

        {vintageStats.length > 0 && (
          <section className="mt-7">
            <h2 className="font-display text-base text-cream">{t("overview.vintages")}</h2>
            <Histogram data={vintageStats} />
          </section>
        )}

        {bottles > 0 && (
          <section className="mt-7">
            <h2 className="font-display text-base text-cream">{t("overview.window")}</h2>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <WindowCard value={pastPeak} title={t("overview.pastPeak")} sub={`< ${now - 6}`} barColor="oklch(0.55 0.2 25)" />
              <WindowCard value={greatNow} title={t("overview.greatNow")} sub={`${now - 6} – ${now}`} barColor="oklch(0.7 0.18 145)" highlight />
              <WindowCard value={cellarWorthy} title={t("overview.cellarWorthy")} sub={`${now + 1}+`} barColor="oklch(0.78 0.13 75)" />
            </div>
          </section>
        )}

        {ratingStats.rated > 0 && (
          <section className="mt-7">
            <h2 className="font-display text-base text-cream">{t("overview.ratings")}</h2>
            <div className="mt-3 space-y-1.5">
              {ratingStats.buckets.map((count, i) => {
                const max = Math.max(...ratingStats.buckets, 1);
                return (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="w-6 text-muted-foreground">{i + 1}★</span>
                    <div className="relative h-2 flex-1 rounded-full bg-white/8">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold/80 to-copper"
                        style={{ width: `${(count / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-cream">{count}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {growthStats.length > 1 && (
          <section className="mt-7">
            <h2 className="font-display text-base text-cream">{t("overview.growth")}</h2>
            <Sparkline data={growthStats} />
          </section>
        )}

        {varietalStats.length > 0 && (
          <section className="mt-7 mb-4">
            <h2 className="font-display text-base text-cream">{t("overview.topVarietals")}</h2>
            <div className="mt-3 space-y-2.5">
              {varietalStats.map((v) => (
                <div key={v.name} className="flex items-center gap-3 text-xs">
                  <span className="w-40 shrink-0 truncate text-foreground/85">{v.name}</span>
                  <div className="relative h-1.5 flex-1 rounded-full bg-white/8">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold/80 to-copper"
                      style={{ width: `${Math.min(100, v.pct * 2)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-muted-foreground">{v.pct}%</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {bottles === 0 && wines.length === 0 && (
          <p className="mt-10 text-center text-sm text-muted-foreground">{t("overview.empty")}</p>
        )}
      </div>
    </AppShell>
  );
}

function formatMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${Math.round(n)} ${currency}`;
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card/40 px-2 py-3 text-center">
      <p className="font-display text-base leading-none text-cream">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function BigStat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card/40 px-3 py-3">
      <p className="font-display text-xl text-cream">{value}</p>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-muted-foreground/80">{sub}</p> : null}
    </div>
  );
}

function WindowCard({ value, title, sub, barColor, highlight }: { value: number; title: string; sub: string; barColor: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border ${highlight ? "border-success/30 bg-success/5" : "border-white/10 bg-card/40"} p-3 text-center`}>
      <p className="font-display text-2xl text-cream">{value}</p>
      <p className="mt-0.5 text-[11px] text-foreground/80">{title}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
      <div className="mt-2 h-1 rounded-full" style={{ background: barColor, opacity: 0.7 }} />
    </div>
  );
}

function DonutChart({ segments, colors, size }: { segments: number[]; colors: string[]; size: number }) {
  const cx = size / 2, cy = size / 2;
  const r = size / 2 - 4;
  const inner = r * 0.62;
  let acc = 0;
  const total = segments.reduce((a, b) => a + b, 0) || 1;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      {segments.map((v, i) => {
        const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
        acc += v;
        const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        const xi1 = cx + inner * Math.cos(a1), yi1 = cy + inner * Math.sin(a1);
        const xi0 = cx + inner * Math.cos(a0), yi0 = cy + inner * Math.sin(a0);
        return (
          <path
            key={i}
            d={`M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${xi1},${yi1} A${inner},${inner} 0 ${large} 0 ${xi0},${yi0} Z`}
            fill={colors[i % colors.length]}
            stroke="oklch(0.13 0.008 30)"
            strokeWidth="1.5"
          />
        );
      })}
    </svg>
  );
}

function Histogram({ data }: { data: { year: number; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="mt-3">
      <div className="flex h-24 items-end gap-1">
        {data.map((d) => (
          <div key={d.year} className="flex flex-1 flex-col items-center gap-1" title={`${d.year}: ${d.count}`}>
            <div
              className="w-full rounded-t bg-gradient-to-t from-burgundy/80 to-gold/60"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{data[0]?.year}</span>
        {data.length > 2 ? <span>{data[Math.floor(data.length / 2)]?.year}</span> : null}
        <span>{data[data.length - 1]?.year}</span>
      </div>
    </div>
  );
}

function Sparkline({ data }: { data: { label: string; total: number }[] }) {
  const w = 300, h = 70, pad = 6;
  const max = Math.max(...data.map((d) => d.total), 1);
  const step = (w - pad * 2) / Math.max(1, data.length - 1);
  const pts = data.map((d, i) => [pad + i * step, h - pad - (d.total / max) * (h - pad * 2)] as const);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${path} L${pts[pts.length - 1][0].toFixed(1)},${h - pad} L${pts[0][0].toFixed(1)},${h - pad} Z`;
  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.68 0.12 75)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="oklch(0.68 0.12 75)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#sparkFill)" />
        <path d={path} fill="none" stroke="oklch(0.72 0.13 75)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.8} fill="oklch(0.85 0.1 80)" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        {data.map((d) => <span key={d.label}>{d.label}</span>)}
      </div>
    </div>
  );
}
