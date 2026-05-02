import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, Bell, Wine, Star, Bookmark } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/cellar")({
  head: () => ({
    meta: [
      { title: "Cellar — WineSnap" },
      { name: "description", content: "Your collected wines and tasting notes." },
    ],
  }),
  component: CellarPage,
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
  wine_type: string | null;
  fruit: number | null; tannin: number | null; acidity: number | null; body: number | null;
};

function CellarPage() {
  const { user } = useAuth();
  const [wines, setWines] = useState<WineRow[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("wines")
      .select("id,producer,wine_name,vintage,region,country,image_url,grape_varieties,wine_type,fruit,tannin,acidity,body")
      .order("created_at", { ascending: false })
      .then(({ data }) => setWines((data as WineRow[]) ?? []));
  }, [user]);

  const regionsCount = new Set(wines.map((w) => w.region).filter(Boolean)).size;
  const grapesCount = new Set(wines.flatMap((w) => w.grape_varieties ?? [])).size;

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
          </button>
        </header>

        <h1 className="mt-5 font-display text-[32px] leading-tight">My Cellar</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your tasted and saved wines.</p>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <Stat value={String(wines.length)} label="Bottles" />
          <Stat value={String(regionsCount)} label="Regions" />
          <Stat value={String(grapesCount)} label="Grapes" />
        </div>

        <ul className="mt-6 space-y-3 pb-4">
          {wines.length === 0 && (
            <li className="rounded-xl border border-white/8 bg-card/40 p-8 text-center text-sm text-muted-foreground">
              No wines yet — scan a label to start your cellar.
            </li>
          )}
          {wines.map((w) => {
            const rating = computeRating(w);
            return (
              <li key={w.id}>
                <Link to="/wine/$id" params={{ id: w.id }} className="flex gap-3 rounded-xl border border-white/8 bg-card/50 p-3 hover:bg-card/70">
                  <div className="flex h-[88px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-b from-burgundy/40 to-background/60">
                    {w.image_url ? (
                      <img src={w.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Wine className="h-6 w-6 text-gold/60" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-display text-base text-cream">
                        {w.wine_name ?? w.producer ?? "Unknown"} {w.vintage ?? ""}
                      </p>
                      <Bookmark className="h-4 w-4 shrink-0 fill-gold/30 text-gold" />
                    </div>
                    <p className="truncate text-xs text-gold">{[w.region, w.country].filter(Boolean).join(", ")}</p>
                    <p className="truncate text-xs text-muted-foreground">{w.grape_varieties?.join(", ") || "—"}</p>
                    <div className="mt-1 flex items-center gap-1 text-xs">
                      <Star className="h-3 w-3 fill-gold text-gold" />
                      <span>{rating.toFixed(1)}</span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </AppShell>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card/50 p-3 text-center">
      <p className="font-display text-2xl text-cream">{value}</p>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function computeRating(w: { fruit: number | null; tannin: number | null; acidity: number | null; body: number | null }): number {
  const vals = [w.fruit, w.tannin, w.acidity, w.body].filter((v): v is number => v != null);
  if (vals.length === 0) return 4.0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.max(3.5, Math.min(5, 3.5 + (mean / 10) * 1.5));
}
