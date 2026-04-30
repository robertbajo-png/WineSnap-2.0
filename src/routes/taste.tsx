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
          <SummaryCard stats={stats} count={wines.length} />
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

type Stats = {
  grapes: [string, number][];
  regions: [string, number][];
  types: [string, number][];
  avg: {
    fruit: number | null;
    tannin: number | null;
    acidity: number | null;
    oak: number | null;
    sweetness: number | null;
    body: number | null;
  };
};

function SummaryCard({ stats, count }: { stats: Stats; count: number }) {
  const topGrape = stats.grapes[0]?.[0];
  const topRegion = stats.regions[0]?.[0];
  const topType = stats.types[0]?.[0];
  const recommended = TYPE_LABEL[topType ?? "unknown"] ?? "Övrigt";

  const { tannin, body, acidity, sweetness, oak, fruit } = stats.avg;
  const traits: string[] = [];
  if (body != null) traits.push(body >= 7 ? "fylliga" : body <= 3 ? "lätta" : "medelfylliga");
  if (tannin != null && tannin >= 7) traits.push("tanninrika");
  if (acidity != null && acidity >= 7) traits.push("friska");
  if (sweetness != null && sweetness >= 6) traits.push("med sötma");
  if (oak != null && oak >= 6) traits.push("ekfatslagrade");
  if (fruit != null && fruit >= 7) traits.push("fruktdrivna");

  const summary = topGrape
    ? `Du dras till ${traits.slice(0, 3).join(", ") || "balanserade"} viner — ofta ${recommended.toLowerCase()} på ${topGrape}${topRegion ? ` från ${topRegion}` : ""}.`
    : "Skanna fler vin så förfinar vi din profil.";

  return (
    <Card className="mt-6 overflow-hidden border-burgundy/20 bg-gradient-wine/5 p-5">
      <div className="flex items-center gap-2 text-burgundy">
        <Sparkles className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-widest">Sammanfattning</span>
      </div>
      <p className="mt-3 font-display text-lg leading-snug">{summary}</p>
      <p className="mt-1 text-xs text-muted-foreground">Baserat på {count} vin</p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Highlight icon={<Grape className="h-4 w-4" />} label="Toppdruva" value={topGrape ?? "—"} />
        <Highlight icon={<MapPin className="h-4 w-4" />} label="Topp­region" value={topRegion ?? "—"} />
        <Highlight icon={<Wine className="h-4 w-4" />} label="Rek. typ" value={recommended} />
      </div>
    </Card>
  );
}

function Highlight({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-3">
      <div className="flex items-center gap-1.5 text-burgundy">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1.5 font-display text-sm leading-tight line-clamp-2">{value}</p>
    </div>
  );
}
