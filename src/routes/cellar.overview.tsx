import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MobileDetails } from "@/components/MobileDetails";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/i18n";
import { CellarOrigins } from "@/components/CellarOrigins";
import { summarizeCellarPrices } from "@/lib/cellarValue";
import { RetailPricePanel } from "@/components/RetailPricePanel";
import { missingPriceSchema, type PriceRequest, type RetailWine } from "@/lib/retailPrices";

export const Route = createFileRoute("/cellar/overview")({
  head: () => ({
    meta: [
      { title: "Cellar Overview — WineSnap" },
      {
        name: "description",
        content: "Value, consumption, regions and varietals across your cellar.",
      },
    ],
  }),
  component: CellarOverviewPage,
});

type WineRow = RetailWine & {
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
  market_price: number | null;
  market_price_currency: string | null;
  market_price_checked_at: string | null;
};

const LEGACY_COLS =
  "id,producer,wine_name,region,country,grape_varieties,vintage,wine_type,user_rating,purchase_price,purchase_currency,purchased_at,consumed_at,quantity,created_at,updated_at,systembolaget_id,market_price,market_price_currency,market_price_source,market_price_checked_at";
const PRICE_COLS = `${LEGACY_COLS},bottle_ml,retail_price_status,retail_price_attempted_at,retail_price_match,retail_price_candidates`;

async function loadWines(userId: string, ids?: string[], ready = true) {
  const wines: WineRow[] = [];
  for (let from = 0; ; from += 500) {
    let query = supabase
      .from("wines")
      .select(ready ? PRICE_COLS : LEGACY_COLS)
      .eq("user_id", userId)
      .order("id")
      .range(from, from + 499);
    if (ids) query = query.in("id", ids);
    const { data, error } = await query;
    if (ready && missingPriceSchema(error)) return loadWines(userId, ids, false);
    if (error) throw error;
    const rows = (data ?? []) as unknown as WineRow[];
    wines.push(...rows);
    if (rows.length < 500) return { wines, ready };
  }
}

async function requestPrices(input: PriceRequest, signal: AbortSignal) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("No session");
  const response = await fetch("/api/public/hooks/refresh-cellar-values", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  });
  const json = await response.json();
  if (!response.ok)
    throw new Error(json.error === "migration_required" ? "migration_required" : "Request failed");
  return json as unknown;
}

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
  const userId = user?.id;
  const t = useT();
  const [wines, setWines] = useState<WineRow[]>([]);
  const [pricesReady, setPricesReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const currentUser = useRef(userId);
  currentUser.current = userId;

  useEffect(() => {
    let cancelled = false;
    setWines([]);
    setPricesReady(false);
    setLoadError(false);
    setLoading(Boolean(userId));
    if (!userId) return;
    loadWines(userId)
      .then(({ wines, ready }) => {
        if (cancelled) return;
        setWines(wines);
        setPricesReady(ready);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const active = wines.filter((w) => !w.consumed_at);
  const consumed = wines.filter((w) => w.consumed_at);
  const bottles = active.reduce((sum, w) => sum + (w.quantity ?? 1), 0);
  const bottlesConsumed = consumed.reduce((sum, w) => sum + (w.quantity ?? 1), 0);
  const regions = new Set(wines.map((w) => w.region).filter(Boolean)).size;
  const countries = new Set(wines.map((w) => w.country).filter(Boolean)).size;

  const purchase = summarizeCellarPrices(wines, "purchase");
  const now = new Date().getFullYear();
  const pastPeak = active
    .filter((w) => w.vintage && w.vintage < now - 6)
    .reduce((s, w) => s + (w.quantity ?? 1), 0);
  const greatNow = active
    .filter((w) => w.vintage && w.vintage >= now - 6 && w.vintage <= now - 1)
    .reduce((s, w) => s + (w.quantity ?? 1), 0);
  const cellarWorthy = active
    .filter((w) => w.vintage && w.vintage >= now)
    .reduce((s, w) => s + (w.quantity ?? 1), 0);

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
    let acc = keys
      .slice(0, keys.length - tail.length)
      .reduce((s, k) => s + (byMonth.get(k) ?? 0), 0);
    return tail.map((k) => {
      acc += byMonth.get(k) ?? 0;
      const [, mm] = k.split("-");
      return { label: mm, total: acc };
    });
  }, [wines]);

  if (loading || loadError) {
    return (
      <AppShell>
        <p
          role={loadError ? "alert" : "status"}
          className="py-8 text-center text-base text-muted-foreground"
        >
          {t(loadError ? "common.error" : "common.loading")}
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        <header className="flex items-center justify-between">
          <Link
            to="/cellar"
            aria-label={t("cellar.title")}
            title={t("cellar.title")}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/5 min-h-11"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="font-display text-2xl text-gold">{t("overview.title")}</h1>
          <span className="h-9 w-9" />
        </header>

        <section className="mt-5 grid grid-cols-3 gap-2">
          <Stat value={String(bottles)} label={t("overview.bottles")} />
          <Stat value={String(regions)} label={t("overview.regions")} />
          <Stat value={String(countries)} label={t("overview.countries")} />
        </section>

        {(active.length > 0 || bottlesConsumed > 0) && (
          <MobileDetails title={t("overview.totalValue")} className="mt-4">
            <section className="mt-4 grid grid-cols-2 gap-2">
              <BigStat
                value={
                  purchase.groups.length
                    ? purchase.groups.map((g) => formatMoney(g.total, g.currency)).join(" / ")
                    : "—"
                }
                label={t("overview.totalValue")}
                sub={
                  purchase.excluded
                    ? `${purchase.excluded} ${t("overview.missingPrice")}`
                    : `${purchase.groups.reduce((sum, g) => sum + g.bottles, 0)} ${t("overview.priced")}`
                }
              />
              <BigStat
                value={
                  purchase.groups.length
                    ? purchase.groups
                        .map((g) => formatMoney(g.total / g.bottles, g.currency))
                        .join(" / ")
                    : "—"
                }
                label={t("overview.avgBottle")}
              />
              <BigStat value={String(bottlesConsumed)} label={t("overview.consumed")} />
              <BigStat
                value={ratingStats.rated ? ratingStats.avg.toFixed(1) : "—"}
                label={t("overview.avgRating")}
                sub={ratingStats.rated ? `${ratingStats.rated} ${t("overview.rated")}` : ""}
              />
            </section>
          </MobileDetails>
        )}

        {active.length > 0 && (
          <RetailPricePanel
            key={userId}
            wines={wines}
            ready={pricesReady}
            request={requestPrices}
            reload={async (ids) => {
              if (!userId) return;
              const refreshed = await loadWines(userId, ids, pricesReady);
              if (currentUser.current !== userId) return;
              setWines((previous) =>
                previous.map((wine) => refreshed.wines.find((next) => next.id === wine.id) ?? wine),
              );
              setPricesReady(refreshed.ready);
            }}
          />
        )}

        {typeStats.length > 0 && (
          <section className="mt-6">
            <h2 className="font-display text-base text-cream">{t("overview.byType")}</h2>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full border border-white/10">
              {typeStats.map((s) => (
                <div
                  key={s.type}
                  style={{
                    width: `${s.pct}%`,
                    background: TYPE_COLORS[s.type] ?? "oklch(0.4 0.02 60)",
                  }}
                  title={`${s.type} ${s.pct}%`}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {typeStats.map((s) => (
                <span key={s.type} className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: TYPE_COLORS[s.type] ?? "oklch(0.4 0.02 60)" }}
                  />
                  <span className="capitalize text-foreground/85">{s.type}</span>
                  <span>{s.count}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {active.length > 0 && (
          <CellarOrigins
            points={active.map((wine) => ({
              region: wine.region,
              country: wine.country,
              count: wine.quantity ?? 1,
            }))}
          />
        )}

        {bottles > 0 && (
          <section className="mt-7">
            <h2 className="font-display text-base text-cream">{t("overview.window")}</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 min-[380px]:grid-cols-3">
              <WindowCard
                value={pastPeak}
                title={t("overview.pastPeak")}
                sub={`< ${now - 6}`}
                barColor="oklch(0.55 0.2 25)"
              />
              <WindowCard
                value={greatNow}
                title={t("overview.greatNow")}
                sub={`${now - 6} – ${now}`}
                barColor="oklch(0.7 0.18 145)"
                highlight
              />
              <WindowCard
                value={cellarWorthy}
                title={t("overview.cellarWorthy")}
                sub={`${now + 1}+`}
                barColor="oklch(0.78 0.13 75)"
              />
            </div>
          </section>
        )}

        {(vintageStats.length > 0 ||
          ratingStats.rated > 0 ||
          growthStats.length > 1 ||
          varietalStats.length > 0) && (
          <MobileDetails title={t("overview.moreDetails")} className="mt-6">
            {vintageStats.length > 0 && (
              <section className="mt-3">
                <h2 className="font-display text-lg text-cream">{t("overview.vintages")}</h2>
                <Histogram data={vintageStats} />
              </section>
            )}
            {ratingStats.rated > 0 && (
              <section className="mt-7">
                <h2 className="font-display text-base text-cream">{t("overview.ratings")}</h2>
                <div className="mt-3 space-y-1.5">
                  {ratingStats.buckets.map((count, i) => {
                    const max = Math.max(...ratingStats.buckets, 1);
                    return (
                      <div key={i} className="flex items-center gap-3 text-sm">
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
                    <div key={v.name} className="flex items-center gap-3 text-sm">
                      <span className="w-[45%] shrink-0 break-words text-foreground/85">
                        {v.name}
                      </span>
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
          </MobileDetails>
        )}

        {bottles === 0 && wines.length === 0 && (
          <p className="mt-10 text-center text-base text-muted-foreground">{t("overview.empty")}</p>
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
      <p className="font-display text-2xl leading-none text-cream">{value}</p>
      <p className="mt-1 break-words text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function BigStat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card/40 px-3 py-3">
      <p className="break-words font-display text-lg text-cream">{value}</p>
      <p className="text-sm uppercase tracking-wider text-muted-foreground">{label}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground/80">{sub}</p> : null}
    </div>
  );
}

function WindowCard({
  value,
  title,
  sub,
  barColor,
  highlight,
}: {
  value: number;
  title: string;
  sub: string;
  barColor: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border ${highlight ? "border-success/30 bg-success/5" : "border-white/10 bg-card/40"} p-3 text-center`}
    >
      <p className="font-display text-2xl text-cream">{value}</p>
      <p className="mt-0.5 text-sm text-foreground/80">{title}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
      <div className="mt-2 h-1 rounded-full" style={{ background: barColor, opacity: 0.7 }} />
    </div>
  );
}

function Histogram({ data }: { data: { year: number; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="mt-3">
      <div className="flex h-24 items-end gap-1">
        {data.map((d) => (
          <div
            key={d.year}
            className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1"
            title={`${d.year}: ${d.count}`}
          >
            <div
              className="w-full rounded-t bg-gradient-to-t from-burgundy/80 to-gold/60"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{data[0]?.year}</span>
        {data.length > 2 ? <span>{data[Math.floor(data.length / 2)]?.year}</span> : null}
        <span>{data[data.length - 1]?.year}</span>
      </div>
    </div>
  );
}

function Sparkline({ data }: { data: { label: string; total: number }[] }) {
  const w = 300,
    h = 70,
    pad = 6;
  const max = Math.max(...data.map((d) => d.total), 1);
  const step = (w - pad * 2) / Math.max(1, data.length - 1);
  const pts = data.map(
    (d, i) => [pad + i * step, h - pad - (d.total / max) * (h - pad * 2)] as const,
  );
  const path = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");
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
        <path
          d={path}
          fill="none"
          stroke="oklch(0.72 0.13 75)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.8} fill="oklch(0.85 0.1 80)" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        {data.map((d) => (
          <span key={d.label}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}
