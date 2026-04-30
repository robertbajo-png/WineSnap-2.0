import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Wine, Trash2, Thermometer, GlassWater } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MeterRow } from "@/components/MeterRow";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/wine/$id")({
  head: () => ({ meta: [{ title: "Vin — Winesnap" }] }),
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

const TYPE_LABEL: Record<string, string> = {
  red: "Rött vin",
  white: "Vitt vin",
  rose: "Rosé",
  sparkling: "Mousserande",
  dessert: "Dessertvin",
  fortified: "Starkvin",
  orange: "Orange vin",
  unknown: "Vin",
};

function WineDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [w, setW] = useState<WineRow | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <AppShell>
      <button
        onClick={() => window.history.back()}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Tillbaka
      </button>

      <div className="flex gap-4">
        <div className="flex h-32 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-champagne shadow-soft">
          {w.image_url ? (
            <img src={w.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Wine className="h-8 w-8 text-burgundy" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-burgundy">
            {TYPE_LABEL[w.wine_type ?? "unknown"]}
          </p>
          <h1 className="mt-1 font-display text-2xl leading-tight">{w.wine_name ?? "Okänt vin"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[w.producer, w.vintage].filter(Boolean).join(" • ")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {[w.region, w.country].filter(Boolean).join(", ")}
          </p>
        </div>
      </div>

      {w.grape_varieties && w.grape_varieties.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {w.grape_varieties.map((g) => (
            <span
              key={g}
              className="rounded-full border border-burgundy/30 bg-burgundy/5 px-2.5 py-0.5 text-xs text-burgundy"
            >
              {g}
            </span>
          ))}
        </div>
      )}

      {w.description && (
        <Card className="mt-5 p-4">
          <p className="font-display text-base leading-relaxed text-foreground">{w.description}</p>
        </Card>
      )}

      <section className="mt-6">
        <h2 className="mb-3 font-display text-xl">Smakprofil</h2>
        <Card className="space-y-3 p-4">
          <MeterRow label="Frukt" value={w.fruit} />
          <MeterRow label="Tannin" value={w.tannin} />
          <MeterRow label="Syra" value={w.acidity} />
          <MeterRow label="Ek" value={w.oak} />
          <MeterRow label="Sötma" value={w.sweetness} />
          <MeterRow label="Fyllighet" value={w.body} />
        </Card>
      </section>

      {(w.primary_notes?.length || w.secondary_notes?.length || w.tertiary_notes?.length) && (
        <section className="mt-6">
          <h2 className="mb-3 font-display text-xl">Aromer</h2>
          <Card className="space-y-3 p-4">
            {w.primary_notes && w.primary_notes.length > 0 && (
              <NoteGroup label="Primära" notes={w.primary_notes} />
            )}
            {w.secondary_notes && w.secondary_notes.length > 0 && (
              <NoteGroup label="Sekundära" notes={w.secondary_notes} />
            )}
            {w.tertiary_notes && w.tertiary_notes.length > 0 && (
              <NoteGroup label="Tertiära" notes={w.tertiary_notes} />
            )}
          </Card>
        </section>
      )}

      {w.food_pairings && w.food_pairings.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 font-display text-xl">Matparning</h2>
          <div className="space-y-2.5">
            {w.food_pairings.map((p, i) => (
              <Card key={i} className="p-4">
                <p className="font-display text-base">{p.dish}</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.reason}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-3 font-display text-xl">Servering</h2>
        <Card className="grid grid-cols-3 gap-2 p-4 text-center">
          <div>
            <Thermometer className="mx-auto h-5 w-5 text-burgundy" />
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Temp</p>
            <p className="font-display text-sm">{w.serving_temp ?? "—"}</p>
          </div>
          <div>
            <GlassWater className="mx-auto h-5 w-5 text-burgundy" />
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Glas</p>
            <p className="font-display text-sm">{w.glass_type ?? "—"}</p>
          </div>
          <div>
            <Wine className="mx-auto h-5 w-5 text-burgundy" />
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Dekantera</p>
            <p className="font-display text-sm">{w.decant == null ? "—" : w.decant ? "Ja" : "Nej"}</p>
          </div>
        </Card>
      </section>

      <Button variant="ghost" onClick={remove} className="mt-8 w-full text-destructive hover:text-destructive">
        <Trash2 className="h-4 w-4" /> Ta bort vin
      </Button>
    </AppShell>
  );
}

function NoteGroup({ label, notes }: { label: string; notes: string[] }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {notes.map((n) => (
          <span key={n} className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}
