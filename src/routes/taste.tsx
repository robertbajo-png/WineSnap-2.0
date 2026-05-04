import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/taste")({
  head: () => ({
    meta: [
      { title: "Taste Preferences — WineSnap" },
      { name: "description", content: "Tell us what you enjoy most." },
    ],
  }),
  component: TastePage,
});

const POPULAR_REGIONS = [
  "Bordeaux",
  "Burgundy",
  "Tuscany",
  "Napa Valley",
  "Rioja",
  "Champagne",
  "Barossa Valley",
];
const MORE_REGIONS = [
  "Piedmont",
  "Veneto",
  "Sicily",
  "Sonoma",
  "Oregon",
  "Ribera del Duero",
  "Priorat",
  "Douro",
  "Alentejo",
  "Margaret River",
  "Marlborough",
  "Loire",
  "Rhône",
  "Alsace",
  "Provence",
  "Mosel",
  "Rheingau",
  "Mendoza",
  "Maipo Valley",
  "Stellenbosch",
  "Tokaj",
];
const TYPES = ["Red", "White", "Sparkling"] as const;
const POPULAR_GRAPES = [
  "Cabernet Sauvignon",
  "Merlot",
  "Pinot Noir",
  "Syrah",
  "Chardonnay",
  "Sauvignon Blanc",
  "Riesling",
];
const MORE_GRAPES = [
  "Tempranillo",
  "Sangiovese",
  "Nebbiolo",
  "Malbec",
  "Grenache",
  "Zinfandel",
  "Cabernet Franc",
  "Petit Verdot",
  "Gamay",
  "Pinot Grigio",
  "Viognier",
  "Chenin Blanc",
  "Gewürztraminer",
  "Albariño",
  "Grüner Veltliner",
  "Semillon",
];

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
  const [types, setTypes] = useState<string[]>(["Red"]);
  const [regions, setRegions] = useState<string[]>(["Bordeaux", "Tuscany"]);
  const [body, setBody] = useState(80);
  const [dry, setDry] = useState(85);
  const [oak, setOak] = useState(90);
  const [tannin, setTannin] = useState(70);
  const [acid, setAcid] = useState(75);
  const [sweet, setSweet] = useState(20);
  const [showMoreRegions, setShowMoreRegions] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => {
      const p = data as Profile | null;
      if (!p) return;
      if (p.preferred_types) setTypes(p.preferred_types);
      if (p.preferred_regions) setRegions(p.preferred_regions);
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
      body: Math.round(body / 10),
      sweetness: Math.round(sweet / 10),
      oak: Math.round(oak / 10),
      tannin: Math.round(tannin / 10),
      acidity: Math.round(acid / 10),
    };
    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) return toast.error(error.message);
    toast.success("Preferences saved");
    navigate({ to: "/me" });
  };

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        <header className="flex items-center justify-between">
          <button onClick={() => window.history.back()} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <h1 className="font-display text-xl text-gold">Taste Preferences</h1>
            <p className="text-[11px] text-muted-foreground">Tell us what you enjoy most.</p>
          </div>
          <span className="h-9 w-9" />
        </header>

        <section className="mt-6">
          <h2 className="font-display text-base text-gold">1. Wine Types</h2>
          <div className="mt-3 flex gap-2">
            {TYPES.map((t) => {
              const active = types.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => toggle(types, setTypes, t)}
                  className={cn(
                    "flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border text-sm transition-colors",
                    active
                      ? "border-burgundy bg-burgundy text-cream"
                      : "border-white/15 bg-card/40 text-foreground/80",
                  )}
                >
                  {t}
                  {active && <Check className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-display text-base text-gold">2. Taste Profile</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Adjust the sliders to match your palate.</p>
          <div className="mt-4 space-y-4">
            <SliderRow label="Bold" leftLabel="Light" rightLabel="Bold" value={body} onChange={setBody} />
            <SliderRow label="Dry" leftLabel="Sweet" rightLabel="Dry" value={dry} onChange={setDry} />
            <SliderRow label="Oak" leftLabel="No Oak" rightLabel="Oaked" value={oak} onChange={setOak} />
            <SliderRow label="Tannin" leftLabel="Low" rightLabel="High" value={tannin} onChange={setTannin} />
            <SliderRow label="Acidity" leftLabel="Low" rightLabel="High" value={acid} onChange={setAcid} />
            <SliderRow label="Sweetness" leftLabel="Dry" rightLabel="Sweet" value={sweet} onChange={setSweet} />
          </div>
        </section>

        <section className="mt-7">
          <h2 className="font-display text-base text-gold">3. Favorite Regions</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Select up to 5 regions you love.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[...POPULAR_REGIONS, ...(showMoreRegions ? MORE_REGIONS : []), ...regions.filter((r) => !POPULAR_REGIONS.includes(r) && !MORE_REGIONS.includes(r))].map((r) => {
              const active = regions.includes(r);
              return (
                <button
                  key={r}
                  onClick={() => toggle(regions, setRegions, r)}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs transition-colors",
                    active
                      ? "border-burgundy bg-burgundy text-cream"
                      : "border-white/15 bg-card/40 text-foreground/80",
                  )}
                >
                  {r}
                  {active && <Check className="h-3 w-3" />}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setShowMoreRegions((v) => !v)}
              className="flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-card/40 px-3.5 text-xs text-gold/90 transition-colors hover:bg-white/5"
            >
              {showMoreRegions ? "− Less" : "+ More"}
            </button>
          </div>
        </section>

        <button
          onClick={save}
          className="mt-8 mb-4 flex h-13 h-[52px] w-full items-center justify-center rounded-2xl bg-gradient-burgundy font-display text-base text-cream shadow-elegant ring-1 ring-burgundy/40"
        >
          Save Preferences
        </button>
      </div>
    </AppShell>
  );
}

function SliderRow({
  label,
  leftLabel,
  rightLabel,
  value,
  onChange,
  muted = false,
}: {
  label: string;
  leftLabel: string;
  rightLabel: string;
  value: number;
  onChange: (v: number) => void;
  muted?: boolean;
}) {
  return (
    <div className="grid grid-cols-[64px_1fr] items-center gap-3">
      <span className="text-sm text-foreground/80">{label}</span>
      <div>
        <div className="relative h-1.5 rounded-full bg-white/10">
          <div
            className={cn(
              "pointer-events-none absolute left-0 top-0 h-full rounded-full",
              muted ? "bg-white/30" : "bg-gradient-to-r from-burgundy to-copper",
            )}
            style={{ width: `${value}%` }}
          />
          <span
            className={cn(
              "pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 shadow",
              muted ? "border-white/40 bg-white" : "border-cream bg-burgundy",
            )}
            style={{ left: `${value}%` }}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={value}
            onChange={(e) => onChange(parseInt(e.target.value))}
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      </div>
    </div>
  );
}
