import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Wine } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/for-you")({
  head: () => ({ meta: [{ title: "För dig — Winesnap" }] }),
  component: ForYouPage,
});

type W = {
  id: string;
  producer: string | null;
  wine_name: string | null;
  region: string | null;
  grape_varieties: string[] | null;
  wine_type: string | null;
  image_url: string | null;
  user_rating: number | null;
};

function ForYouPage() {
  const { user, loading } = useAuth();
  const [wines, setWines] = useState<W[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("wines")
      .select("id,producer,wine_name,region,grape_varieties,wine_type,image_url,user_rating")
      .order("created_at", { ascending: false })
      .then(({ data }) => setWines((data as W[]) ?? []));
  }, [user]);

  const recommendations = useMemo(() => {
    if (wines.length < 2) return [];
    // Räkna favoritdruvor och regioner
    const grapes = new Map<string, number>();
    const regions = new Map<string, number>();
    for (const w of wines) {
      w.grape_varieties?.forEach((g) => grapes.set(g, (grapes.get(g) ?? 0) + 1));
      if (w.region) regions.set(w.region, (regions.get(w.region) ?? 0) + 1);
    }
    // Poängsätt vin utifrån match
    const scored = wines.map((w) => {
      let score = 0;
      w.grape_varieties?.forEach((g) => (score += (grapes.get(g) ?? 0) * 2));
      if (w.region) score += regions.get(w.region) ?? 0;
      return { w, score };
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, 5);
  }, [wines]);

  if (!loading && !user) {
    return (
      <AppShell>
        <div className="mt-20 text-center">
          <p className="text-muted-foreground">Logga in för rekommendationer.</p>
          <Link to="/login">
            <Button className="mt-4 bg-gradient-gold text-background">Logga in</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-gold" />
        <h1 className="font-display text-3xl">För dig</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Rekommendationer baserat på din smak
      </p>

      {recommendations.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Skanna minst två vin så börjar vi föreslå.
        </p>
      ) : (
        <div className="mt-6 space-y-2.5">
          {recommendations.map(({ w }) => (
            <Link key={w.id} to="/wine/$id" params={{ id: w.id }}>
              <Card className="flex items-center gap-3 p-3 shadow-soft hover:shadow-elegant">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5">
                  {w.image_url ? (
                    <img src={w.image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Wine className="h-6 w-6 text-gold" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base">{w.wine_name ?? "Okänt vin"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[w.producer, w.region, w.grape_varieties?.join(", ")].filter(Boolean).join(" • ")}
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
