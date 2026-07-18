import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

export const Route = createFileRoute("/taste")({
  head: () => ({
    meta: [
      { title: "Taste Preferences — WineSnap" },
      { name: "description", content: "Tell us what you enjoy most." },
    ],
  }),
  component: TastePage,
});

const POPULAR_REGIONS = ["Bordeaux","Burgundy","Tuscany","Napa Valley","Rioja","Champagne","Barossa Valley"];
const MORE_REGIONS = ["Piedmont","Veneto","Sicily","Sonoma","Oregon","Ribera del Duero","Priorat","Douro","Alentejo","Margaret River","Marlborough","Loire","Rhône","Alsace","Provence","Mosel","Rheingau","Mendoza","Maipo Valley","Stellenbosch","Tokaj"];
const TYPES = ["Red", "White", "Sparkling"] as const;
const POPULAR_GRAPES = ["Cabernet Sauvignon","Merlot","Pinot Noir","Syrah","Chardonnay","Sauvignon Blanc","Riesling"];
const MORE_GRAPES = ["Tempranillo","Sangiovese","Nebbiolo","Malbec","Grenache","Zinfandel","Cabernet Franc","Petit Verdot","Gamay","Pinot Grigio","Viognier","Chenin Blanc","Gewürztraminer","Albariño","Grüner Veltliner","Semillon"];

type Profile = {
  id: string;
  preferred_types: string[] | null;
  preferred_regions: string[] | null;
  preferred_grapes: string[] | null;
  body: number | null;
  sweetness: number | null;
  oak: number | null;
  tannin: number | null;
  acidity: number | null;
};

function TastePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const [types, setTypes] = useState<string[]>(["Red"]);
  const [regions, setRegions] = useState<string[]>(["Bordeaux", "Tuscany"]);
  const [grapes, setGrapes] = useState<string[]>([]);
  const [body, setBody] = useState(80);
  const [dry, setDry] = useState(85);
  const [oak, setOak] = useState(90);
  const [tannin, setTannin] = useState(70);
  const [acid, setAcid] = useState(75);
  const [sweet, setSweet] = useState(20);
  const [showMoreRegions, setShowMoreRegions] = useState(false);
  const [showMoreGrapes, setShowMoreGrapes] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => {
      const p = data as Profile | null;
      if (!p) return;
      if (p.preferred_types) setTypes(p.preferred_types);
      if (p.preferred_regions) setRegions(p.preferred_regions);
      if (p.preferred_grapes) setGrapes(p.preferred_grapes);
      if (p.body != null) setBody(p.body * 10);
      if (p.sweetness != null) setSweet(p.sweetness * 10);
      if (p.oak != null) setOak(p.oak * 10);
      if (p.tannin != null) setTannin(p.tannin * 10);
      if (p.acidity != null) setAcid(p.acidity * 10);
    });
  }, [user]);

  const toggle = (arr: string[], setter: (v: string[]) => void, v: string) => {
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };

  const save = async () => {
    if (!user) return navigate({ to: "/login" });
    const payload = {
      id: user.id,
      preferred_types: types,
      preferred_regions: regions,
      preferred_grapes: grapes,
      body: Math.round(body / 10),
      sweetness: Math.round(sweet / 10),
      oak: Math.round(oak / 10),
      tannin: Math.round(tannin / 10),
      acidity: Math.round(acid / 10),
    };
    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) return toast.error(error.message);
    toast.success(t("taste.saved"));
    navigate({ to: "/me" });
  };

  const typeLabel = (ty: string) => t(`type.${ty.toLowerCase()}` as any) || ty;
  const showMoreLabel = (v: boolean) => (v ? t("common.showLess") : t("common.showMore"));

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        <header className="flex items-center justify-between">
          <button onClick={() => window.history.back()} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <h1 className="font-display text-xl text-gold">{t("taste.title")}</h1>
            <p className="text-[11px] text-muted-foreground">{t("taste.subtitle")}</p>
          </div>
          <span className="h-9 w-9" />
        </header>

        <section id="types" className="mt-6 scroll-mt-20">
          <h2 className="font-display text-base text-gold">{t("taste.wineTypes")}</h2>
          <div className="mt-3 flex gap-2">
            {TYPES.map((ty) => {
              const active = types.includes(ty);
              return (
                <button
                  key={ty}
                  onClick={() => toggle(types, setTypes, ty)}
                  className={cn(
                    "flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border text-sm transition-colors",
                    active ? "border-burgundy bg-burgundy text-cream" : "border-white/15 bg-card/40 text-foreground/80",
                  )}
                >
                  {typeLabel(ty)}
                  {active && <Check className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
        </section>

        <section id="profile" className="mt-6 scroll-mt-20">
          <h2 className="font-display text-base text-gold">{t("taste.profileHeading")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("taste.profileSub")}</p>
          <div className="mt-4 space-y-4">
            <SliderRow label={t("taste.body")} leftLabel={t("taste.light")} rightLabel={t("taste.bold")} value={body} onChange={setBody} />
            <SliderRow label={t("taste.dry")} leftLabel={t("taste.sweet")} rightLabel={t("taste.dry")} value={dry} onChange={setDry} />
            <SliderRow label={t("taste.oak")} leftLabel={t("taste.noOak")} rightLabel={t("taste.oaked")} value={oak} onChange={setOak} />
            <SliderRow label={t("taste.tannin")} leftLabel={t("taste.low")} rightLabel={t("taste.high")} value={tannin} onChange={setTannin} />
            <SliderRow label={t("taste.acidity")} leftLabel={t("taste.low")} rightLabel={t("taste.high")} value={acid} onChange={setAcid} />
            <SliderRow label={t("taste.sweetness")} leftLabel={t("taste.dry")} rightLabel={t("taste.sweet")} value={sweet} onChange={setSweet} />
          </div>
        </section>

        <section id="regions" className="mt-7 scroll-mt-20">
          <h2 className="font-display text-base text-gold">{t("taste.regions")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("taste.regionsSub")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[...POPULAR_REGIONS, ...(showMoreRegions ? MORE_REGIONS : []), ...regions.filter((r) => !POPULAR_REGIONS.includes(r) && !MORE_REGIONS.includes(r))].map((r) => {
              const active = regions.includes(r);
              return (
                <button
                  key={r}
                  onClick={() => toggle(regions, setRegions, r)}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs transition-colors",
                    active ? "border-burgundy bg-burgundy text-cream" : "border-white/15 bg-card/40 text-foreground/80",
                  )}
                >
                  {r}
                  {active && <Check className="h-3 w-3" />}
                </button>
              );
            })}
            <button type="button" onClick={() => setShowMoreRegions((v) => !v)} className="flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-card/40 px-3.5 text-xs text-gold/90 transition-colors hover:bg-white/5">
              {showMoreLabel(showMoreRegions)}
            </button>
          </div>
        </section>

        <section id="grapes" className="mt-7 scroll-mt-20">
          <h2 className="font-display text-base text-gold">{t("taste.grapes")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("taste.grapesSub")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[...POPULAR_GRAPES, ...(showMoreGrapes ? MORE_GRAPES : []), ...grapes.filter((g) => !POPULAR_GRAPES.includes(g) && !MORE_GRAPES.includes(g))].map((g) => {
              const active = grapes.includes(g);
              return (
                <button
                  key={g}
                  onClick={() => toggle(grapes, setGrapes, g)}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs transition-colors",
                    active ? "border-burgundy bg-burgundy text-cream" : "border-white/15 bg-card/40 text-foreground/80",
                  )}
                >
                  {g}
                  {active && <Check className="h-3 w-3" />}
                </button>
              );
            })}
            <button type="button" onClick={() => setShowMoreGrapes((v) => !v)} className="flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-card/40 px-3.5 text-xs text-gold/90 transition-colors hover:bg-white/5">
              {showMoreLabel(showMoreGrapes)}
            </button>
          </div>
        </section>

        <button onClick={save} className="mt-8 mb-4 flex h-[52px] w-full items-center justify-center rounded-2xl bg-gradient-burgundy font-display text-base text-cream shadow-elegant ring-1 ring-burgundy/40">
          {t("taste.save")}
        </button>
      </div>
    </AppShell>
  );
}

function SliderRow({ label, leftLabel, rightLabel, value, onChange }: { label: string; leftLabel: string; rightLabel: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-[64px_1fr] items-center gap-3">
      <span className="text-sm text-foreground/80">{label}</span>
      <div>
        <div className="relative h-1.5 rounded-full bg-white/10">
          <div className="pointer-events-none absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-burgundy to-copper" style={{ width: `${value}%` }} />
          <span className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-cream bg-burgundy shadow" style={{ left: `${value}%` }} />
          <input type="range" min={0} max={100} value={value} onChange={(e) => onChange(parseInt(e.target.value))} className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      </div>
    </div>
  );
}
