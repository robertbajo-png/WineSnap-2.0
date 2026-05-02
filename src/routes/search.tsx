import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search as SearchIcon, X, ChevronDown, SlidersHorizontal, Bookmark, Star, Wine, Menu, Bell } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search — WineSnap" },
      { name: "description", content: "Discover wines by region, varietal, price, and rating." },
    ],
  }),
  component: SearchPage,
});

type WineRow = {
  id: string;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  region: string | null;
  country: string | null;
  image_url: string | null;
  grape_varieties: string[] | null;
  fruit: number | null;
  tannin: number | null;
  acidity: number | null;
  body: number | null;
};

function SearchPage() {
  const [q, setQ] = useState("");
  const [wines, setWines] = useState<WineRow[]>([]);

  useEffect(() => {
    supabase
      .from("wines")
      .select("id,producer,wine_name,vintage,region,country,image_url,grape_varieties,fruit,tannin,acidity,body")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setWines((data as WineRow[]) ?? []));
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return wines;
    return wines.filter((w) =>
      [w.wine_name, w.producer, w.region, w.country, ...(w.grape_varieties ?? [])]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(t)),
    );
  }, [q, wines]);

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        <header className="flex items-center justify-between">
          <button aria-label="Menu" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
            <Menu className="h-5 w-5" strokeWidth={1.6} />
          </button>
          <Logo size="md" />
          <button aria-label="Notifications" className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
            <Bell className="h-5 w-5" strokeWidth={1.6} />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-burgundy" />
          </button>
        </header>

        <h1 className="mt-5 font-display text-[32px] leading-tight">Search</h1>

        {/* Search bar + Filters */}
        <div className="mt-4 flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cabernet"
              className="h-11 w-full rounded-xl border border-white/10 bg-card/60 pl-10 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-gold/40 focus:outline-none"
            />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button className="flex h-11 items-center gap-1.5 rounded-xl border border-burgundy/40 bg-burgundy/10 px-3.5 text-sm text-burgundy">
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </button>
        </div>

        {/* Filter chips */}
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
          {["Region", "Varietal", "Price", "Rating"].map((f) => (
            <FilterChip key={f}>{f}</FilterChip>
          ))}
          <button className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-card/60">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Results header */}
        <div className="mt-5 flex items-baseline justify-between">
          <h2 className="font-display text-xl">Discover</h2>
          <span className="text-xs text-muted-foreground">{filtered.length} results</span>
        </div>

        {/* Result list */}
        <ul className="mt-3 space-y-3 pb-4">
          {filtered.length === 0 ? (
            <li className="rounded-xl border border-white/8 bg-card/40 p-8 text-center text-sm text-muted-foreground">
              No wines yet — scan your first.
            </li>
          ) : (
            filtered.map((w) => <ResultCard key={w.id} w={w} />)
          )}
        </ul>
      </div>
    </AppShell>
  );
}

function FilterChip({ children }: { children: React.ReactNode }) {
  return (
    <button className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-card/60 px-3 text-xs text-foreground/90">
      {children}
      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );
}

function ResultCard({ w }: { w: WineRow }) {
  const rating = computeRating(w);
  const match = Math.round(70 + (rating - 3.5) * 20);
  const price = 65 + (w.id.charCodeAt(0) % 60);
  return (
    <li>
      <Link
        to="/wine/$id"
        params={{ id: w.id }}
        className="flex gap-3 rounded-xl border border-white/8 bg-card/50 p-3 transition-colors hover:bg-card/70"
      >
        <div className="relative flex h-[88px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-b from-burgundy/40 to-background/60">
          {w.image_url ? (
            <img src={w.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Wine className="h-6 w-6 text-gold/60" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-display text-base leading-tight text-cream">
              {w.wine_name ?? w.producer ?? "Unknown wine"} {w.vintage ?? ""}
            </p>
            <Bookmark className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <p className="truncate text-xs text-gold">{[w.region, w.country].filter(Boolean).join(", ")}</p>
          <p className="truncate text-xs text-muted-foreground">{w.grape_varieties?.join(", ") || "—"}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs">
            <Star className="h-3 w-3 fill-gold text-gold" />
            <span className="font-medium">{rating.toFixed(1)}</span>
            <span className="text-muted-foreground">({30 + (w.id.charCodeAt(1) % 120)} ratings)</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className={cn(
              "rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success",
            )}>{match}% Match</span>
            <span className="font-display text-base text-cream">${price}</span>
          </div>
        </div>
      </Link>
    </li>
  );
}

function computeRating(w: { fruit: number | null; tannin: number | null; acidity: number | null; body: number | null }): number {
  const vals = [w.fruit, w.tannin, w.acidity, w.body].filter((v): v is number => v != null);
  if (vals.length === 0) return 4.0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.max(3.5, Math.min(5, 3.5 + (mean / 10) * 1.5));
}
