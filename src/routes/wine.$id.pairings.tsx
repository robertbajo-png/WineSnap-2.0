import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Wine, Thermometer, Utensils } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { WineImage } from "@/components/WineImage";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { mealsEnabled } from "@/features/meals/feature";
import { useT, useI18n } from "@/i18n";

export const Route = createFileRoute("/wine/$id/pairings")({
  head: () => ({ meta: [{ title: "Pairings | WineSnap" }] }),
  component: PairingsPage,
});
type Pair = { dish: string; reason: string };
type WineRow = {
  id: string;
  user_id: string;
  image_url: string | null;
  wine_name: string | null;
  vintage: number | null;
  region: string | null;
  country: string | null;
  food_pairings: unknown;
  serving_temp: string | null;
};
function validPair(value: unknown): value is Pair {
  return (
    !!value &&
    typeof value === "object" &&
    "dish" in value &&
    typeof value.dish === "string" &&
    value.dish.length > 0 &&
    "reason" in value &&
    typeof value.reason === "string"
  );
}
function PairingsPage() {
  const { id } = Route.useParams(),
    t = useT(),
    { lang } = useI18n(),
    { user } = useAuth();
  const sv = lang === "sv";
  const [w, setW] = useState<WineRow | null>(null),
    [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    let active = true;
    setW(null);
    setStatus("loading");
    void supabase
      .from("wines")
      .select("id,user_id,image_url,wine_name,vintage,region,country,food_pairings,serving_temp")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (active) {
          setW(data);
          setStatus(!error && data ? "ready" : "failed");
        }
      });
    return () => {
      active = false;
    };
  }, [id, user?.id]);
  const pairings = Array.isArray(w?.food_pairings)
    ? w.food_pairings.filter(validPair).slice(0, 6)
    : [];
  return (
    <AppShell>
      <header className="flex items-center gap-3">
        <button
          onClick={() => window.history.back()}
          className="flex h-12 w-12 shrink-0 items-center justify-center"
          aria-label={sv ? "Tillbaka" : "Back"}
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="font-display text-2xl text-gold">{t("pairings.title")}</h1>
      </header>
      {status === "loading" && (
        <p role="status" className="my-8">
          {t("common.loading")}
        </p>
      )}
      {status === "failed" && (
        <p role="alert" className="my-8">
          {sv
            ? "Vinet kunde inte hämtas eller är inte tillgängligt för dig."
            : "This wine could not be loaded or is not available to you."}
        </p>
      )}
      {w && (
        <>
          <section className="my-5 flex items-center gap-4 border-b border-white/15 pb-5">
            <div className="flex h-24 w-14 shrink-0 items-center justify-center">
              {w.image_url ? (
                <WineImage src={w.image_url} alt="" className="h-full w-full object-contain" />
              ) : (
                <Wine className="text-gold" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-xl break-words">
                {w.wine_name ?? (sv ? "Namnlöst vin" : "Unnamed wine")} {w.vintage ?? ""}
              </h2>
              <p className="mt-1 text-base text-muted-foreground">
                {[w.region, w.country].filter(Boolean).join(", ")}
              </p>
            </div>
          </section>
          {mealsEnabled && user?.id === w.user_id && (
            <a
              className="mb-5 flex min-h-12 items-center gap-3 text-base text-gold"
              href={`/kitchen#pairings?wine=${w.id}`}
            >
              <Utensils size={20} />
              {sv ? "Hitta recept till vinet" : "Find recipes for this wine"}
              <ArrowRight size={18} />
            </a>
          )}
          <h2 className="font-display text-xl">
            {sv ? "Sparade matförslag" : "Saved food suggestions"}
          </h2>
          <p className="my-2 text-base text-muted-foreground">
            {sv
              ? "Förslag från vinanalysen, inte provade kombinationer eller uppmätta matchtal."
              : "Suggestions from the wine analysis, not tasted pairings or measured match scores."}
          </p>
          {!pairings.length && (
            <p className="my-6 text-base">
              {sv
                ? "Inga matförslag är sparade för detta vin."
                : "No food suggestions are saved for this wine."}
            </p>
          )}
          <ul className="my-4">
            {pairings.map((p, i) => (
              <li key={i} className="border-b border-white/15 py-5">
                <h3 className="font-display text-xl break-words">{p.dish}</h3>
                <p className="mt-2 text-base leading-relaxed text-muted-foreground break-words">
                  {p.reason}
                </p>
              </li>
            ))}
          </ul>
          {w.serving_temp && (
            <section className="my-6 flex gap-3">
              <Thermometer size={22} className="shrink-0 text-gold" />
              <div>
                <h2 className="text-base font-semibold">{t("pairings.servingTip")}</h2>
                <p className="mt-1 text-base">{w.serving_temp}</p>
              </div>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
