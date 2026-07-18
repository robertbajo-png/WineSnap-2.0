import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Wine, Star, Thermometer } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

export const Route = createFileRoute("/wine/$id/pairings")({
  head: () => ({ meta: [{ title: "Pairings — WineSnap" }] }),
  component: PairingsPage,
});

type Pair = { dish: string; reason: string };
type WineRow = {
  id: string;
  image_url: string | null;
  wine_name: string | null;
  vintage: number | null;
  region: string | null;
  country: string | null;
  food_pairings: Pair[] | null;
  serving_temp: string | null;
  fruit: number | null; tannin: number | null; acidity: number | null; body: number | null;
};

const FALLBACK: { dish: string; reason: string; emoji: string; match: number }[] = [
  { dish: "Steak", reason: "Rich, savory flavors highlight the wine's structure and dark fruit.", emoji: "🥩", match: 92 },
  { dish: "Mushroom risotto", reason: "Earthy mushrooms complement the wine's depth and elegance.", emoji: "🍚", match: 89 },
  { dish: "Aged cheddar", reason: "Sharp cheese brings out the wine's complexity and smooth tannins.", emoji: "🧀", match: 85 },
  { dish: "Herb-roasted lamb", reason: "Herbs and lamb enhance the wine's aromas and balanced finish.", emoji: "🍖", match: 84 },
];

function PairingsPage() {
  const { id } = Route.useParams();
  const t = useT();
  const [w, setW] = useState<WineRow | null>(null);
  const CATEGORIES = [t("pairings.best"), t("pairings.meat"), t("pairings.pasta"), t("pairings.cheese")];
  const [cat, setCat] = useState<string>(CATEGORIES[0]);

  useEffect(() => {
    supabase.from("wines").select("id,image_url,wine_name,vintage,region,country,food_pairings,serving_temp,fruit,tannin,acidity,body").eq("id", id).maybeSingle().then(({ data }) => setW(data as WineRow | null));
  }, [id]);

  if (!w) return <AppShell><div className="mt-20 text-center text-muted-foreground">{t("common.loading")}</div></AppShell>;

  const rating = computeRating(w);
  const pairings = (w.food_pairings && w.food_pairings.length ? w.food_pairings : FALLBACK).slice(0, 6);

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        <header className="flex items-center justify-between">
          <button onClick={() => window.history.back()} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-display text-xl text-gold">{t("pairings.title")}</h1>
          <span className="h-9 w-9" />
        </header>

        <section className="mt-4 flex items-center gap-3 rounded-xl border border-white/8 bg-card/50 p-3">
          <div className="flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-b from-burgundy/40 to-background/60">
            {w.image_url ? <img src={w.image_url} alt="" className="h-full w-full object-cover" /> : <Wine className="h-5 w-5 text-gold/60" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base text-cream">{w.wine_name ?? "Unknown"} {w.vintage ?? ""}</p>
            <p className="truncate text-xs text-gold">{[w.region, w.country].filter(Boolean).join(", ")}</p>
            <div className="mt-1 flex items-center gap-1 text-xs">
              <Star className="h-3 w-3 fill-gold text-gold" />
              <span>{rating.toFixed(1)}</span>
            </div>
          </div>
        </section>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                "h-8 shrink-0 rounded-full border px-3.5 text-xs transition-colors",
                cat === c ? "border-burgundy bg-burgundy text-cream" : "border-white/10 bg-card/40 text-foreground/80",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <ul className="mt-4 space-y-3 pb-3">
          {pairings.map((p, i) => {
            const fb = FALLBACK[i] ?? FALLBACK[0];
            const match = ("match" in p ? (p as any).match : null) ?? fb.match;
            const emoji = ("emoji" in p ? (p as any).emoji : null) ?? fb.emoji;
            return (
              <li key={i}>
                <div className="flex gap-3 rounded-xl border border-white/8 bg-card/50 p-3">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-white/8 to-white/0 text-4xl">
                    {emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base leading-tight text-cream">{p.dish}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.reason}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-center justify-center">
                    <span className="font-display text-base leading-none text-cream">{match}</span>
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{t("pairings.match")}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mb-4 flex items-center gap-3 rounded-xl border border-gold/20 bg-gold/5 p-3.5">
          <Thermometer className="h-5 w-5 shrink-0 text-gold" />
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-medium text-gold">{t("pairings.servingTip")}</p>
            <p className="mt-0.5 text-foreground/80">{w.serving_temp ?? t("pairings.servingDefault")}</p>
          </div>
        </div>
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
