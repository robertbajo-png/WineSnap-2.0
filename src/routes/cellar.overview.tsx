import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Share2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Sparkline } from "@/components/Sparkline";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/cellar/overview")({
  head: () => ({
    meta: [
      { title: "Cellar Overview — WineSnap" },
      { name: "description", content: "Value, regions, drinking window and varietals across your cellar." },
    ],
  }),
  component: CellarOverviewPage,
});

type WineRow = {
  region: string | null; grape_varieties: string[] | null; vintage: number | null;
};

const REGION_COLORS = [
  { color: "oklch(0.5 0.18 18)", label: "Bordeaux" },
  { color: "oklch(0.4 0.16 30)", label: "Burgundy" },
  { color: "oklch(0.62 0.14 50)", label: "Napa Valley" },
  { color: "oklch(0.45 0.1 130)", label: "Piedmont" },
  { color: "oklch(0.32 0.04 200)", label: "Others" },
];
const REGION_PCT = [35, 22, 18, 12, 13];
const REGION_VAL = [8620, 5420, 4440, 2960, 3240];

function CellarOverviewPage() {
  const { user } = useAuth();
  const [wines, setWines] = useState<WineRow[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("wines")
      .select("region,grape_varieties,vintage")
      .eq("user_id", user.id)
      .then(({ data }) => setWines((data as WineRow[]) ?? []));
  }, [user]);

  const bottles = wines.length;
  const value = bottles * 158; // est. avg per bottle
  const regions = new Set(wines.map((w) => w.region).filter(Boolean)).size;

  // Drinking window
  const now = new Date().getFullYear();
  const pastPeak = wines.filter((w) => w.vintage && w.vintage < now - 6).length;
  const greatNow = wines.filter((w) => w.vintage && w.vintage >= now - 6 && w.vintage <= now - 1).length;
  const cellarWorthy = wines.filter((w) => w.vintage && w.vintage >= now).length;

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        <header className="flex items-center justify-between">
          <button onClick={() => window.history.back()} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-display text-xl text-gold">Cellar Overview</h1>
          <button className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
            <Share2 className="h-5 w-5 text-foreground/80" />
          </button>
        </header>

        {/* Cellar Value */}
        <section className="mt-5 rounded-xl border border-white/8 bg-card/50 p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Cellar Value</p>
          <p className="mt-1 font-display text-[40px] leading-none text-cream">${value.toLocaleString("en-US")}</p>
          <p className="mt-1 text-xs text-success">↑ 12.4% vs last month</p>
          <div className="mt-3">
            <Sparkline className="h-20 w-full" />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              {["Jan", "Feb", "Mar", "Apr", "May", "Jun"].map((m) => <span key={m}>{m}</span>)}
            </div>
          </div>
        </section>

        {/* Quick stats */}
        <section className="mt-3 grid grid-cols-4 gap-2">
          <Stat value={String(bottles)} label="Bottles" />
          <Stat value={`$${(value / 1000).toFixed(0)},${value % 1000}`} label="Value" />
          <Stat value={String(regions)} label="Regions" />
          <Stat value="4.2" label="Avg. Rating" />
        </section>

        {/* Value by Region */}
        <section className="mt-6">
          <h2 className="font-display text-base text-cream">Value by Region</h2>
          <div className="mt-3 flex items-center gap-4">
            <DonutChart segments={REGION_PCT} colors={REGION_COLORS.map((r) => r.color)} size={130} />
            <div className="flex-1 space-y-2 text-xs">
              {REGION_COLORS.map((r, i) => (
                <div key={r.label} className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                  <span className="flex-1 text-foreground/85">{r.label}</span>
                  <span className="text-muted-foreground">{REGION_PCT[i]}%</span>
                  <span className="w-14 text-right font-display text-cream">${REGION_VAL[i].toLocaleString("en-US")}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Drinking Window */}
        <section className="mt-7">
          <h2 className="font-display text-base text-cream">Drinking Window</h2>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <WindowCard value={pastPeak} title="Past Peak" sub={`< ${now - 6}`} barColor="oklch(0.55 0.2 25)" />
            <WindowCard value={greatNow} title="Great Now" sub={`${now - 6} – ${now}`} barColor="oklch(0.7 0.18 145)" highlight />
            <WindowCard value={cellarWorthy} title="Cellar Worthy" sub={`${now + 1}+`} barColor="oklch(0.78 0.13 75)" />
          </div>
        </section>

        {/* Top Varietals */}
        <section className="mt-7 mb-4">
          <h2 className="font-display text-base text-cream">Top Varietals</h2>
          <div className="mt-3 space-y-2.5">
            {[
              { name: "Cabernet Sauvignon", pct: 36 },
              { name: "Pinot Noir", pct: 22 },
              { name: "Chardonnay", pct: 16 },
              { name: "Merlot", pct: 14 },
              { name: "Sangiovese", pct: 12 },
            ].map((v) => (
              <div key={v.name} className="flex items-center gap-3 text-xs">
                <span className="w-40 shrink-0 text-foreground/85">{v.name}</span>
                <div className="relative h-1.5 flex-1 rounded-full bg-white/8">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold/80 to-copper"
                    style={{ width: `${v.pct * 2}%` }}
                  />
                </div>
                <span className="w-8 text-right text-muted-foreground">{v.pct}%</span>
              </div>
            ))}
          </div>
        </section>
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
  const total = segments.reduce((a, b) => a + b, 0);
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
            fill={colors[i]}
            stroke="oklch(0.13 0.008 30)"
            strokeWidth="1.5"
          />
        );
      })}
    </svg>
  );
}
