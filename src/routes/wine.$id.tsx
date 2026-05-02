import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Heart, Share2, Wine, Trash2, Star, Info } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MeterRow } from "@/components/MeterRow";
import { RadarChart } from "@/components/RadarChart";
import { AromaChip } from "@/components/AromaChip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/wine/$id")({
  head: () => ({ meta: [{ title: "Vin — WineSnap" }] }),
  component: WineDetailPage,
});

type Pair = { dish: string; reason: string };
type WineRow = {
  id: string;
  image_url: string | null;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  grape_varieties: string[] | null;
  region: string | null;
  country: string | null;
  wine_type: string | null;
  description: string | null;
  fruit: number | null;
  tannin: number | null;
  acidity: number | null;
  oak: number | null;
  sweetness: number | null;
  body: number | null;
  primary_notes: string[] | null;
  secondary_notes: string[] | null;
  tertiary_notes: string[] | null;
  food_pairings: Pair[] | null;
  serving_temp: string | null;
  glass_type: string | null;
  decant: boolean | null;
};

type Tab = "overview" | "details" | "pairings" | "notes";

function WineDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [w, setW] = useState<WineRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    supabase
      .from("wines")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        setW(data as WineRow | null);
        setLoading(false);
      });
  }, [id]);

  const remove = async () => {
    if (!confirm("Ta bort detta vin?")) return;
    const { error } = await supabase.from("wines").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Borttaget");
    navigate({ to: "/history" });
  };

  if (loading) {
    return (
      <AppShell>
        <div className="mt-20 text-center text-muted-foreground">Laddar…</div>
      </AppShell>
    );
  }
  if (!w) {
    return (
      <AppShell>
        <div className="mt-20 text-center">
          <p className="text-muted-foreground">Vinet kunde inte hittas.</p>
          <Link to="/history">
            <Button className="mt-4">Till historik</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  // Pseudo "match score" — fast 95 är hardcoded i mockup, vi räknar enkelt utifrån fyllighet/data
  const matchScore = computeMatch(w);
  const rating = computeRating(w);
  const allAromas = [...(w.primary_notes ?? []), ...(w.secondary_notes ?? []), ...(w.tertiary_notes ?? [])].slice(0, 5);

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-6">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => window.history.back()}
            aria-label="Tillbaka"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-foreground hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex gap-2">
            <button
              aria-label="Dela"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-foreground hover:bg-white/10"
            >
              <Share2 className="h-4 w-4" />
            </button>
            <button
              aria-label="Favorit"
              onClick={() => setLiked(!liked)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 hover:bg-white/10"
            >
              <Heart className={cn("h-4 w-4", liked ? "fill-burgundy text-burgundy" : "text-foreground")} />
            </button>
          </div>
        </div>

        {/* Hero: bottle + title */}
        <div className="mt-6 flex gap-4">
          <div className="relative flex h-44 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-white/8 to-white/2 shadow-elegant">
            {w.image_url ? (
              <img src={w.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <Wine className="h-10 w-10 text-gold/60" />
            )}
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h1 className="font-display text-2xl leading-tight">
              {w.wine_name ?? "Okänt vin"}
              {w.vintage ? ` ${w.vintage}` : ""}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[w.region, w.country].filter(Boolean).join(", ") || w.producer}
            </p>
            {(w.country || w.wine_type) && (
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                {countryToFlag(w.country) && <span className="text-base leading-none">{countryToFlag(w.country)}</span>}
                <span>{TYPE_LABEL[w.wine_type ?? "unknown"]}</span>
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <span className="font-display text-2xl">{rating.toFixed(1)}</span>
              <Stars value={rating} />
            </div>
            <p className="text-[11px] text-muted-foreground">128 betyg</p>

            {/* Price boxes */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/10 bg-background/40 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Marknadspris</p>
                <p className="font-display text-lg leading-tight">{Math.round(380 + matchScore * 2)} kr</p>
                <p className="text-[10px] text-muted-foreground">snittpris</p>
              </div>
              <div className="rounded-lg border border-gold/20 bg-gold/5 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Källarvärde</p>
                <p className="font-display text-lg leading-tight text-gold">{Math.round(420 + matchScore * 2.4)} kr</p>
                <p className="text-[10px] text-success">↑ 12%</p>
              </div>
            </div>

            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
              {matchScore}% Match
              <Info className="h-3 w-3 opacity-70" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-6 border-b border-white/8 text-sm">
          {([
            ["overview", "Översikt"],
            ["details", "Detaljer"],
            ["pairings", "Mat"],
            ["notes", "Noter"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "relative -mb-px py-2.5 transition-colors",
                tab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              {tab === key && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-gold" />}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <>
            {allAromas.length > 0 && (
              <Section title="Aromprofil">
                <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2">
                  {allAromas.map((a) => (
                    <AromaChip key={a} name={a} />
                  ))}
                </div>
              </Section>
            )}

            <Section title="Smakprofil">
              <Card className="bg-card/60 p-4">
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-3.5 self-center">
                    <MeterRow left="Lätt" right="Fyllig" value={w.body} />
                    <MeterRow left="Mjuk" right="Tannin" value={w.tannin} />
                    <MeterRow left="Torr" right="Söt" value={w.sweetness} />
                    <MeterRow left="Mild" right="Syrlig" value={w.acidity} />
                  </div>
                  <div className="flex items-center justify-center">
                    <RadarChart
                      size={180}
                      axes={[
                        { label: "Frukt", value: w.fruit },
                        { label: "Ek", value: w.oak },
                        { label: "Krydda", value: avg(w.tannin, w.oak) },
                        { label: "Jord", value: avg(w.body, w.tannin) },
                        { label: "Blom", value: avg(w.acidity, w.fruit) },
                        { label: "Ört", value: avg(w.acidity, w.body) },
                      ]}
                    />
                  </div>
                </div>
              </Card>
            </Section>

            {w.food_pairings && w.food_pairings.length > 0 && (
              <Section title="Matparningar" right={<button className="text-xs text-gold">Se alla</button>}>
                <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2">
                  {w.food_pairings.slice(0, 4).map((p, i) => (
                    <div key={i} className="w-40 shrink-0">
                      <div className="flex h-28 w-full items-center justify-center rounded-xl bg-gradient-to-b from-white/6 to-white/0 text-3xl">
                        🍽️
                      </div>
                      <p className="mt-2 line-clamp-2 font-display text-sm leading-tight">{p.dish}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{p.reason}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        {tab === "details" && (
          <div className="mt-5 space-y-4">
            {w.description && (
              <Card className="bg-card/60 p-4">
                <p className="font-display text-base leading-relaxed">{w.description}</p>
              </Card>
            )}
            {w.grape_varieties && w.grape_varieties.length > 0 && (
              <KV label="Druvor" value={w.grape_varieties.join(", ")} />
            )}
            <KV label="Region" value={[w.region, w.country].filter(Boolean).join(", ") || "—"} />
            <KV label="Producent" value={w.producer ?? "—"} />
            <KV label="Årgång" value={w.vintage ? String(w.vintage) : "—"} />
            <KV label="Servering" value={w.serving_temp ?? "—"} />
            <KV label="Glas" value={w.glass_type ?? "—"} />
            <KV label="Dekantering" value={w.decant == null ? "—" : w.decant ? "Ja" : "Nej"} />
          </div>
        )}

        {tab === "pairings" && (
          <div className="mt-5 space-y-3">
            {(w.food_pairings ?? []).map((p, i) => (
              <Card key={i} className="bg-card/60 p-4">
                <p className="font-display text-base">{p.dish}</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.reason}</p>
              </Card>
            ))}
            {(!w.food_pairings || w.food_pairings.length === 0) && (
              <p className="py-6 text-center text-sm text-muted-foreground">Inga matparningar.</p>
            )}
          </div>
        )}

        {tab === "notes" && (
          <div className="mt-5 space-y-4">
            <NoteGroup label="Primära" notes={w.primary_notes ?? []} />
            <NoteGroup label="Sekundära" notes={w.secondary_notes ?? []} />
            <NoteGroup label="Tertiära" notes={w.tertiary_notes ?? []} />
          </div>
        )}

        <Button
          variant="ghost"
          onClick={remove}
          className="mt-10 w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" /> Ta bort vin
        </Button>
      </div>
    </AppShell>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-lg text-gold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-white/6 pb-2.5">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-right font-display text-sm">{value}</span>
    </div>
  );
}

function NoteGroup({ label, notes }: { label: string; notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wider text-gold">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {notes.map((n) => (
          <span key={n} className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs">
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

function Stars({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div className="flex">
      {Array.from({ length: max }).map((_, i) => {
        const filled = value >= i + 1;
        const half = !filled && value >= i + 0.5;
        return (
          <Star
            key={i}
            className={cn(
              "h-4 w-4",
              filled || half ? "fill-gold text-gold" : "text-white/15",
              half && "opacity-60",
            )}
          />
        );
      })}
    </div>
  );
}

function avg(...vals: (number | null | undefined)[]): number | null {
  const xs = vals.filter((v): v is number => v != null);
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function computeRating(w: WineRow): number {
  // En enkel weighted score 0-5 baserad på balans mellan komponenter
  const vals = [w.fruit, w.tannin, w.acidity, w.body].filter((v): v is number => v != null);
  if (vals.length === 0) return 4.0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.max(3.5, Math.min(5, 3.5 + (mean / 10) * 1.5));
}

function computeMatch(w: WineRow): number {
  const r = computeRating(w);
  return Math.round(70 + (r - 3.5) * 20);
}
