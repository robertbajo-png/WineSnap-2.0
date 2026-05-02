import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Grape, MapPin, Wine, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarMeter } from "@/components/MeterRow";
import { RadarChart } from "@/components/RadarChart";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/taste")({
  head: () => ({ meta: [{ title: "Smakprofil — WineSnap" }] }),
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
            <Button className="mt-4 bg-gradient-gold text-background">Logga in</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-3xl">Min källare</h1>
        <span className="text-xs text-muted-foreground">{wines.length} vin</span>
      </div>

      {!stats ? (
        <p className="mt-16 text-center text-sm text-muted-foreground">
          Skanna några vin så fyller vi i din smakprofil.
        </p>
      ) : (
        <>
          {/* Stat grid */}
          <div className="mt-5 grid grid-cols-4 gap-2">
            <Stat label="Vin" value={String(wines.length)} />
            <Stat label="Regioner" value={String(stats.regions.length)} />
            <Stat label="Druvor" value={String(stats.grapes.length)} />
            <Stat label="Typer" value={String(stats.types.length)} />
          </div>

          {/* Summary */}
          <SummaryCard stats={stats} count={wines.length} />

          {/* Radar */}
          <section className="mt-6">
            <h2 className="mb-3 font-display text-lg text-gold">Din smakprofil</h2>
            <Card className="flex items-center justify-center bg-card/60 p-4">
              <RadarChart
                size={240}
                axes={[
                  { label: "Frukt", value: stats.avg.fruit },
                  { label: "Tannin", value: stats.avg.tannin },
                  { label: "Syra", value: stats.avg.acidity },
                  { label: "Ek", value: stats.avg.oak },
                  { label: "Sötma", value: stats.avg.sweetness },
                  { label: "Fyllighet", value: stats.avg.body },
                ]}
              />
            </Card>
          </section>

          <section className="mt-6">
            <h2 className="mb-3 font-display text-lg text-gold">Genomsnitt</h2>
            <Card className="space-y-3 bg-card/60 p-4">
              <BarMeter label="Frukt" value={stats.avg.fruit} />
              <BarMeter label="Tannin" value={stats.avg.tannin} />
              <BarMeter label="Syra" value={stats.avg.acidity} />
              <BarMeter label="Ek" value={stats.avg.oak} />
              <BarMeter label="Sötma" value={stats.avg.sweetness} />
              <BarMeter label="Fyllighet" value={stats.avg.body} />
            </Card>
          </section>

          <section className="mt-6">
            <h2 className="mb-3 font-display text-lg text-gold">Favoritdruvor</h2>
            <Card className="bg-card/60 p-4">
              <TopList items={stats.grapes} />
            </Card>
          </section>

          <section className="mt-6">
            <h2 className="mb-3 font-display text-lg text-gold">Favoritregioner</h2>
            <Card className="bg-card/60 p-4">
              <TopList items={stats.regions} />
            </Card>
          </section>
        </>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card/60 p-3 text-center">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl text-gold">{value}</p>
    </div>
  );
}

function TopList({ items }: { items: [string, number][] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Inget än.</p>;
  const max = Math.max(...items.map(([, v]) => v));
  return (
    <ul className="space-y-2.5">
      {items.map(([name, count]) => (
        <li key={name}>
          <div className="flex items-baseline justify-between">
            <span className="text-sm">{name}</span>
            <span className="font-display text-sm tabular-nums text-gold">{count}</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/8">
            <div className="h-full bg-gradient-gold" style={{ width: `${(count / max) * 100}%` }} />
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
    <Card className="mt-5 overflow-hidden border-white/8 bg-gradient-to-br from-burgundy/20 to-card/60 p-5">
      <div className="flex items-center gap-2 text-gold">
        <Sparkles className="h-4 w-4" />
        <span className="text-[10px] font-medium uppercase tracking-widest">Smaksammanfattning</span>
      </div>
      <p className="mt-3 font-display text-lg leading-snug">{summary}</p>
      <p className="mt-1 text-xs text-muted-foreground">Baserat på {count} vin</p>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Highlight icon={<Grape className="h-3.5 w-3.5" />} label="Toppdruva" value={topGrape ?? "—"} />
        <Highlight icon={<MapPin className="h-3.5 w-3.5" />} label="Region" value={topRegion ?? "—"} />
        <Highlight icon={<Wine className="h-3.5 w-3.5" />} label="Typ" value={recommended} />
      </div>
    </Card>
  );
}

function Highlight({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-background/40 p-2.5">
      <div className="flex items-center gap-1 text-gold">
        {icon}
        <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 font-display text-sm leading-tight line-clamp-2">{value}</p>
    </div>
  );
}
