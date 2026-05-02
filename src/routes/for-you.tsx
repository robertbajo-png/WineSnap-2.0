import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Wine, Star } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/for-you")({
  head: () => ({
    meta: [
      { title: "For You — WineSnap" },
      { name: "description", content: "Personalized wine recommendations based on your taste." },
    ],
  }),
  component: ForYouPage,
});

type W = {
  id: string;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  region: string | null;
  country: string | null;
  grape_varieties: string[] | null;
  wine_type: string | null;
  image_url: string | null;
  user_rating: number | null;
  fruit: number | null; tannin: number | null; acidity: number | null; body: number | null; oak: number | null; sweetness: number | null;
};

type Taste = {
  favorite_grapes: Record<string, number> | null;
  favorite_regions: Record<string, number> | null;
  favorite_types: Record<string, number> | null;
  avg_fruit: number | null; avg_tannin: number | null; avg_acidity: number | null;
  avg_oak: number | null; avg_sweetness: number | null; avg_body: number | null;
  total_wines: number | null;
};

function ForYouPage() {
  const { user, loading } = useAuth();
  const [wines, setWines] = useState<W[]>([]);
  const [taste, setTaste] = useState<Taste | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("wines")
      .select("id,producer,wine_name,vintage,region,country,grape_varieties,wine_type,image_url,user_rating,fruit,tannin,acidity,body,oak,sweetness")
      .order("created_at", { ascending: false })
      .then(({ data }) => setWines((data as W[]) ?? []));
    supabase.from("taste_profile").select("*").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setTaste(data as Taste | null));
  }, [user]);

  const recommendations = useMemo(() => {
    if (wines.length === 0) return [];
    const favGrapes = (taste?.favorite_grapes as Record<string, number>) ?? {};
    const favRegions = (taste?.favorite_regions as Record<string, number>) ?? {};
    const favTypes = (taste?.favorite_types as Record<string, number>) ?? {};

    return wines
      .map((w) => {
        let score = 0;
        w.grape_varieties?.forEach((g) => (score += (favGrapes[g] ?? 0) * 3));
        if (w.region) score += (favRegions[w.region] ?? 0) * 2;
        if (w.wine_type) score += favTypes[w.wine_type] ?? 0;
        // taste similarity bonus
        if (taste?.avg_body != null && w.body != null) score += 10 - Math.abs(taste.avg_body - w.body);
        if (taste?.avg_tannin != null && w.tannin != null) score += 10 - Math.abs(taste.avg_tannin - w.tannin);
        const match = Math.min(99, 70 + Math.round(score));
        return { w, score, match };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [wines, taste]);

  if (!loading && !user) {
    return (
      <AppShell>
        <div className="mt-20 text-center">
          <p className="text-muted-foreground">Sign in to see recommendations.</p>
          <Link to="/login"><Button className="mt-4 bg-gradient-burgundy text-cream">Sign in</Button></Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-gold" />
          <h1 className="font-display text-3xl text-cream">For You</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {taste?.total_wines
            ? `Based on ${taste.total_wines} wine${taste.total_wines === 1 ? "" : "s"} in your cellar`
            : "Personalized wine picks based on your taste"}
        </p>

        {recommendations.length === 0 ? (
          <div className="mt-12 rounded-xl border border-white/8 bg-card/40 p-8 text-center">
            <Wine className="mx-auto h-10 w-10 text-gold/60" />
            <p className="mt-3 text-sm text-muted-foreground">Scan at least one wine to get recommendations.</p>
            <Link to="/scan">
              <Button className="mt-4 bg-gradient-burgundy text-cream">Scan a label</Button>
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-2.5 pb-4">
            {recommendations.map(({ w, match }) => (
              <Link key={w.id} to="/wine/$id" params={{ id: w.id }}
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
                    <span className="rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 font-medium text-success">{match}% Match</span>
                    {w.grape_varieties?.[0] && (
                      <span className="truncate text-muted-foreground">{w.grape_varieties.slice(0, 2).join(", ")}</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-gold text-gold" />
                  <span className="text-sm tabular-nums">{(3.5 + (match - 70) / 30 * 1.5).toFixed(1)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
