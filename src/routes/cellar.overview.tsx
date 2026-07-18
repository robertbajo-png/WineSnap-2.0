import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/i18n";

export const Route = createFileRoute("/cellar/overview")({
  head: () => ({
    meta: [
      { title: "Cellar Overview — WineSnap" },
      { name: "description", content: "Regions, drinking window and varietals across your cellar." },
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
};

const PALETTE = [
  "oklch(0.5 0.18 18)",
  "oklch(0.4 0.16 30)",
  "oklch(0.62 0.14 50)",
  "oklch(0.45 0.1 130)",
  "oklch(0.32 0.04 200)",
];

function CellarOverviewPage() {
  const { user } = useAuth();
  const t = useT();
  const [wines, setWines] = useState<WineRow[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("wines")
      .select("region,country,grape_varieties,vintage,wine_type")
      .eq("user_id", user.id)
      .then(({ data }) => setWines((data as WineRow[]) ?? []));
  }, [user]);

  const bottles = wines.length;
  const regions = new Set(wines.map((w) => w.region).filter(Boolean)).size;
  const countries = new Set(wines.map((w) => w.country).filter(Boolean)).size;

  const now = new Date().getFullYear();
  const pastPeak = wines.filter((w) => w.vintage && w.vintage < now - 6).length;
  const greatNow = wines.filter((w) => w.vintage && w.vintage >= now - 6 && w.vintage <= now - 1).length;
  const cellarWorthy = wines.filter((w) => w.vintage && w.vintage >= now).length;

  const regionStats = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of wines) {
      const key = w.region || w.country;
      if (!key) continue;
      m.set(key, (m.get(key) ?? 0) + 1);
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
  }, [wines, bottles]);

  const varietalStats = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of wines) {
      for (const g of w.grape_varieties ?? []) {
        if (!g) continue;
        m.set(g, (m.get(g) ?? 0) + 1);
      }
    }
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, pct: total ? Math.round((count / total) * 100) : 0 }));
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

        {bottles === 0 && (
          <p className="mt-10 text-center text-sm text-muted-foreground">{t("overview.empty")}</p>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card/40 px-2 py-3 text-center">
      <p className="font-display text-base leading-none text-cream">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
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
