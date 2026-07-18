import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Wine, ChevronRight, Star, BarChart3, Camera } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { CellarRowSkeleton } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

export const Route = createFileRoute("/cellar")({
  head: () => ({
    meta: [
      { title: "My Cellar — WineSnap" },
      { name: "description", content: "Your collection of wines, organized by type and rating." },
    ],
  }),
  component: CellarPage,
});

const FILTERS = ["All", "Red", "White", "Rosé", "Sparkling"] as const;
type Filter = typeof FILTERS[number];
const SORTS = ["newest", "oldest", "rating", "vintage", "name"] as const;
type Sort = typeof SORTS[number];

const TYPE_MAP: Record<string, Filter> = { red: "Red", white: "White", rose: "Rosé", sparkling: "Sparkling" };

type WineRow = {
  id: string;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  region: string | null;
  country: string | null;
  image_url: string | null;
  wine_type: string | null;
  created_at: string;
  fruit: number | null; tannin: number | null; acidity: number | null; body: number | null;
};

function CellarPage() {
  const { user } = useAuth();
  const t = useT();
  const [wines, setWines] = useState<WineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("All");
  const [sort, setSort] = useState<Sort>("newest");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    supabase
      .from("wines")
      .select("id,producer,wine_name,vintage,region,country,image_url,wine_type,created_at,fruit,tannin,acidity,body")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setWines((data as WineRow[]) ?? []);
        setLoading(false);
      });
  }, [user]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = wines.filter((w) => {
      if (filter !== "All" && TYPE_MAP[w.wine_type ?? ""] !== filter) return false;
      if (!term) return true;
      return [w.wine_name, w.producer, w.region, w.country]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(term));
    });
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "oldest": return +new Date(a.created_at) - +new Date(b.created_at);
        case "rating": return computeRating(b) - computeRating(a);
        case "vintage": return (b.vintage ?? 0) - (a.vintage ?? 0);
        case "name": return (a.wine_name ?? a.producer ?? "").localeCompare(b.wine_name ?? b.producer ?? "");
        default: return +new Date(b.created_at) - +new Date(a.created_at);
      }
    });
    return sorted;
  }, [wines, filter, q, sort]);

  const filterLabel = (f: Filter) => {
    if (f === "All") return t("cellar.filter.all");
    if (f === "Red") return t("type.red");
    if (f === "White") return t("type.white");
    if (f === "Rosé") return t("type.rose");
    return t("type.sparkling");
  };

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        <header className="flex items-center justify-between">
          <Link to="/cellar/overview" aria-label={t("cellar.overview")} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
            <BarChart3 className="h-5 w-5" strokeWidth={1.6} />
          </Link>
          <h1 className="font-display text-xl">{t("cellar.title")}</h1>
          <Link to="/scan" className="flex h-9 items-center gap-1 rounded-full bg-gradient-burgundy px-3 text-xs font-medium text-cream">
            <Plus className="h-3.5 w-3.5" /> {t("cellar.add")}
          </Link>
        </header>

        <div className="mt-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("cellar.searchPh")}
              className="h-11 w-full rounded-xl border border-white/10 bg-card/60 pl-10 pr-3 text-sm placeholder:text-muted-foreground focus:border-gold/40 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "h-8 shrink-0 rounded-full border px-3.5 text-xs transition-colors",
                filter === f ? "border-burgundy bg-burgundy text-cream" : "border-white/10 bg-card/40 text-foreground/80",
              )}
            >
              {filterLabel(f)}
            </button>
          ))}
        </div>

        <div className="mt-5">
          <h2 className="text-sm">
            <span className="font-display text-lg text-cream">{filtered.length}</span>{" "}
            <span className="text-muted-foreground">{t("cellar.bottles")}</span>
          </h2>
        </div>

        <ul className="mt-3 space-y-2.5 pb-4">
          {loading ? (
            <>
              <li><CellarRowSkeleton /></li>
              <li><CellarRowSkeleton /></li>
              <li><CellarRowSkeleton /></li>
            </>
          ) : filtered.length === 0 ? (
            <li>
              {wines.length === 0 ? (
                <EmptyState
                  icon={Wine}
                  title={t("cellar.emptyTitle")}
                  description={t("cellar.emptyDesc")}
                  action={
                    <Link to="/scan">
                      <Button className="bg-gradient-burgundy text-cream"><Camera className="h-4 w-4" /> {t("cellar.emptyCta")}</Button>
                    </Link>
                  }
                />
              ) : (
                <div className="rounded-xl border border-white/8 bg-card/40 p-8 text-center text-sm text-muted-foreground">
                  {t("cellar.noMatch")}
                </div>
              )}
            </li>
          ) : (
            filtered.map((w) => {
              const rating = computeRating(w);
              return (
                <li key={w.id}>
                  <Link
                    to="/wine/$id"
                    params={{ id: w.id }}
                    className="flex items-center gap-3 rounded-xl border border-white/8 bg-card/50 p-3 transition-colors hover:bg-card/70"
                  >
                    <div className="flex h-[72px] w-[54px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-b from-burgundy/40 to-background/60">
                      {w.image_url ? (
                        <img src={w.image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Wine className="h-5 w-5 text-gold/60" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-base leading-tight text-cream">
                        {w.wine_name ?? w.producer ?? "Unknown"} {w.vintage ?? ""}
                      </p>
                      <p className="truncate text-xs text-gold">{[w.region, w.country].filter(Boolean).join(", ")}</p>
                      <div className="mt-1 flex items-center gap-2 text-[11px]">
                        {w.vintage && <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] tracking-wider text-muted-foreground">{w.vintage}</span>}
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3 fill-gold text-gold" />
                          <span>{rating.toFixed(1)}</span>
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </AppShell>
  );
}

function computeRating(w: { fruit: number | null; tannin: number | null; acidity: number | null; body: number | null }): number {
  const vals = [w.fruit, w.tannin, w.acidity, w.body].filter((v): v is number => v != null);
  if (vals.length === 0) return 4.0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.max(3.5, Math.min(5, 3.5 + (mean / 10) * 1.5));
}
