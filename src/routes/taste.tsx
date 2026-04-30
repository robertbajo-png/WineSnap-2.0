import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Grape, MapPin, Wine, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MeterRow } from "@/components/MeterRow";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/taste")({
  head: () => ({ meta: [{ title: "Smakprofil — Winesnap" }] }),
  component: TastePage,
});

type W = {
  grape_varieties: string[] | null;
  region: string | null;
  wine_type: string | null;
  fruit: number | null;
  tannin: number | null;
  acidity: number | null;
  oak: number | null;
  sweetness: number | null;
  body: number | null;
};

const TYPE_LABEL: Record<string, string> = {
  red: "Rött",
  white: "Vitt",
  rose: "Rosé",
  sparkling: "Mousserande",
  dessert: "Dessertvin",
  fortified: "Starkvin",
  orange: "Orange",
  unknown: "Övrigt",
};

function TastePage() {
  const { user, loading } = useAuth();
  const [wines, setWines] = useState<W[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("wines")
      .select("grape_varieties,region,wine_type,fruit,tannin,acidity,oak,sweetness,body")
      .then(({ data }) => setWines((data as W[]) ?? []));
  }, [user]);

  const stats = useMemo(() => {
    if (wines.length === 0) return null;
    const grapes = new Map<string, number>();
    const regions = new Map<string, number>();
    const types = new Map<string, number>();
    let f = 0, t = 0, a = 0, o = 0, s = 0, b = 0;
    let nf = 0, nt = 0, na = 0, no = 0, ns = 0, nb = 0;
    for (const w of wines) {
      w.grape_varieties?.forEach((g) => grapes.set(g, (grapes.get(g) ?? 0) + 1));
      if (w.region) regions.set(w.region, (regions.get(w.region) ?? 0) + 1);
      if (w.wine_type) types.set(w.wine_type, (types.get(w.wine_type) ?? 0) + 1);
      if (w.fruit != null) { f += w.fruit; nf++; }
      if (w.tannin != null) { t += w.tannin; nt++; }
      if (w.acidity != null) { a += w.acidity; na++; }
      if (w.oak != null) { o += w.oak; no++; }
      if (w.sweetness != null) { s += w.sweetness; ns++; }
      if (w.body != null) { b += w.body; nb++; }
    }
    const top = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      grapes: top(grapes),
      regions: top(regions),
      types: top(types),
      avg: {
        fruit: nf ? f / nf : null,
        tannin: nt ? t / nt : null,
        acidity: na ? a / na : null,
        oak: no ? o / no : null,
        sweetness: ns ? s / ns : null,
        body: nb ? b / nb : null,
      },
    };
  }, [wines]);

  if (!loading && !user) {
    return (
      <AppShell>
        <div className="mt-20 text-center">
          <p className="text-muted-foreground">Logga in för att se din smakprofil.</p>
          <Link to="/login">
            <Button className="mt-4 bg-gradient-wine">Logga in</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex items-center gap-2">
        <Grape className="h-6 w-6 text-burgundy" />
        <h1 className="font-display text-3xl">Din smakprofil</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {wines.length} vin har format din profil
      </p>

      {!stats ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Skanna några vin så fyller vi i din smakprofil.
        </p>
      ) : (
        <>
          <section className="mt-6">
            <h2 className="mb-3 font-display text-xl">Genomsnitt</h2>
            <Card className="space-y-3 p-4">
              <MeterRow label="Frukt" value={stats.avg.fruit} />
              <MeterRow label="Tannin" value={stats.avg.tannin} />
              <MeterRow label="Syra" value={stats.avg.acidity} />
              <MeterRow label="Ek" value={stats.avg.oak} />
              <MeterRow label="Sötma" value={stats.avg.sweetness} />
              <MeterRow label="Fyllighet" value={stats.avg.body} />
            </Card>
          </section>

          <section className="mt-6">
            <h2 className="mb-3 font-display text-xl">Favoritdruvor</h2>
            <Card className="p-4">
              <TopList items={stats.grapes} />
            </Card>
          </section>

          <section className="mt-6">
            <h2 className="mb-3 font-display text-xl">Favoritregioner</h2>
            <Card className="p-4">
              <TopList items={stats.regions} />
            </Card>
          </section>

          <section className="mt-6">
            <h2 className="mb-3 font-display text-xl">Vintyper</h2>
            <Card className="p-4">
              <TopList items={stats.types.map(([k, v]) => [TYPE_LABEL[k] ?? k, v] as [string, number])} />
            </Card>
          </section>
        </>
      )}
    </AppShell>
  );
}

function TopList({ items }: { items: [string, number][] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Inget än.</p>;
  const max = Math.max(...items.map(([, v]) => v));
  return (
    <ul className="space-y-2">
      {items.map(([name, count]) => (
        <li key={name}>
          <div className="flex items-baseline justify-between">
            <span className="text-sm">{name}</span>
            <span className="font-display text-sm tabular-nums text-muted-foreground">{count}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-gradient-wine" style={{ width: `${(count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
