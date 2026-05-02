import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Wine, Star, ChevronRight, SlidersHorizontal } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "Sök vin — WineSnap" }] }),
  component: HistoryPage,
});

type W = {
  id: string;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  image_url: string | null;
  wine_type: string | null;
  region: string | null;
  country: string | null;
  fruit: number | null;
  tannin: number | null;
  acidity: number | null;
  body: number | null;
};

const TYPES = [
  { v: "all", l: "Alla" },
  { v: "red", l: "Rött" },
  { v: "white", l: "Vitt" },
  { v: "rose", l: "Rosé" },
  { v: "sparkling", l: "Bubbel" },
] as const;

function HistoryPage() {
  const { user, loading } = useAuth();
  const [wines, setWines] = useState<W[]>([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("all");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("wines")
      .select("id,producer,wine_name,vintage,image_url,wine_type,region,country,fruit,tannin,acidity,body")
      .order("created_at", { ascending: false })
      .then(({ data }) => setWines((data as W[]) ?? []));
  }, [user]);

  if (!loading && !user) {
    return (
      <AppShell>
        <div className="mt-20 text-center">
          <p className="text-muted-foreground">Logga in för att se din källare.</p>
          <Link to="/login">
            <Button className="mt-4 bg-gradient-gold text-background">Logga in</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const filtered = wines.filter((w) => {
    if (type !== "all" && w.wine_type !== type) return false;
    if (q && !`${w.producer} ${w.wine_name} ${w.region}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl">Min källare</h1>
        <button
          aria-label="Filter"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 hover:bg-white/10"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      </div>

      <Input
        placeholder="Sök producent, namn, region…"
        className="mt-5 border-white/10 bg-card/60"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {TYPES.map((t) => (
          <button
            key={t.v}
            onClick={() => setType(t.v)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              type === t.v
                ? "border-gold bg-gold text-background"
                : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground",
            )}
          >
            {t.l}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-2.5">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {wines.length === 0 ? "Skanna ditt första vin för att fylla din källare." : "Inga vin matchar."}
          </p>
        ) : (
          filtered.map((w) => {
            const rating = computeRating(w);
            return (
              <Link key={w.id} to="/wine/$id" params={{ id: w.id }}>
                <Card className="flex items-center gap-3 border-white/8 bg-card/60 p-3 transition-colors hover:bg-card">
                  <div className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/5">
                    {w.image_url ? (
                      <img src={w.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Wine className="h-5 w-5 text-gold/60" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base leading-tight">
                      {w.wine_name ?? "Okänt vin"} {w.vintage ?? ""}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[w.region, w.country].filter(Boolean).join(", ") || w.producer}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {w.vintage && (
                        <span className="rounded bg-burgundy/30 px-1.5 py-0.5 text-[10px] font-medium text-cream">
                          {w.vintage}
                        </span>
                      )}
                      <Star className="h-3 w-3 fill-gold text-gold" />
                      <span className="text-xs tabular-nums text-muted-foreground">{rating.toFixed(1)}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Card>
              </Link>
            );
          })
        )}
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
