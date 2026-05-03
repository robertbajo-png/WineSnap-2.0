import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Heart, Share2, Wine, Trash2, Star, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AromaWheel, AromaSlider, AROMA_FAMILIES } from "@/components/AromaWheel";
import { AromaIcon, aromaFamilyLabel } from "@/components/AromaIcon";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/wine/$id")({
  head: () => ({ meta: [{ title: "Wine — WineSnap" }] }),
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

const TABS = ["Overview", "Aromas", "Tasting", "Food", "Reviews"] as const;
type Tab = typeof TABS[number];

function WineDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [w, setW] = useState<WineRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("Aromas");
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    supabase.from("wines").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      setW(data as WineRow | null);
      setLoading(false);
    });
  }, [id]);

  const remove = async () => {
    if (!confirm("Delete this wine?")) return;
    const { error } = await supabase.from("wines").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    navigate({ to: "/cellar" });
  };

  if (loading) return <AppShell><div className="mt-20 text-center text-muted-foreground">Loading…</div></AppShell>;
  if (!w) return (
    <AppShell>
      <div className="mt-20 text-center">
        <p className="text-muted-foreground">Wine not found.</p>
        <Link to="/cellar"><Button className="mt-4">Back to cellar</Button></Link>
      </div>
    </AppShell>
  );

  const rating = computeRating(w);
  const match = Math.round(70 + (rating - 3.5) * 20);
  const price = 50 + (w.id.charCodeAt(0) % 80);
  const aromas = [...(w.primary_notes ?? []), ...(w.secondary_notes ?? []), ...(w.tertiary_notes ?? [])].slice(0, 6);

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          <button onClick={() => window.history.back()} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex gap-1">
            <button onClick={() => setLiked(!liked)} aria-label="Favorite" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
              <Heart className={cn("h-5 w-5", liked ? "fill-burgundy text-burgundy" : "text-foreground/80")} strokeWidth={1.6} />
            </button>
            <button aria-label="Share" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
              <Share2 className="h-5 w-5 text-foreground/80" strokeWidth={1.6} />
            </button>
          </div>
        </header>

        {/* Hero */}
        <section className="mt-4 flex gap-4">
          <div className="flex h-36 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-burgundy/40 to-background/60 shadow-elegant">
            {w.image_url ? <img src={w.image_url} alt="" className="h-full w-full object-cover" /> : <Wine className="h-9 w-9 text-gold/60" />}
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h1 className="font-display text-[26px] leading-tight text-cream">
              {w.wine_name ?? "Unknown"}{w.vintage ? ` ${w.vintage}` : ""}
            </h1>
            <p className="mt-1 text-sm text-gold">{[w.region, w.country].filter(Boolean).join(", ") || w.producer}</p>
            <p className="text-xs text-muted-foreground">{w.grape_varieties?.join(", ") || "—"}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">{match}% Match</span>
              <span className="flex items-center gap-1 text-xs">
                <Star className="h-3.5 w-3.5 fill-gold text-gold" />
                <span className="font-medium">{rating.toFixed(1)}</span>
                <span className="text-muted-foreground">(128 ratings)</span>
              </span>
              <span className="font-display text-base text-cream">${price}</span>
            </div>
          </div>
        </section>

        {/* Tabs */}
        <div className="mt-5 flex gap-5 overflow-x-auto border-b border-white/8 text-sm">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "relative -mb-px shrink-0 py-2.5 transition-colors",
                tab === t ? "text-burgundy" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
              {tab === t && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-burgundy" />}
            </button>
          ))}
        </div>

        {tab === "Aromas" && (
          <>
            <Section title="Aroma Profile">
              {/* Hero wheel with soft glow */}
              <div className="relative mt-1 flex items-center justify-center py-3">
                <div className="pointer-events-none absolute h-[260px] w-[260px] rounded-full bg-burgundy/15 blur-3xl" />
                <div className="pointer-events-none absolute h-[210px] w-[210px] rounded-full bg-gold/10 blur-2xl" />
                <div className="relative rounded-full border border-white/10 bg-gradient-to-b from-card/60 to-background/40 p-2 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]">
                  <AromaWheel size={320} />
                </div>
              </div>

              {/* Aroma legend chips */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
                {["Fruit", "Floral", "Spice", "Oak", "Earth"].map((f) => (
                  <span key={f} className="rounded-full border border-white/10 bg-card/50 px-2.5 py-1 font-display text-[11px] tracking-wide text-muted-foreground">
                    {f}
                  </span>
                ))}
              </div>

              {/* Premium aroma cards */}
              <div className="mt-5 grid grid-cols-2 gap-2.5">
                {(aromas.length ? aromas : ["Black cherry", "Plum", "Oak", "Vanilla", "Cedar", "Tobacco"]).slice(0, 6).map((a, i) => {
                  const intensity = 4 - (i % 3);
                  return (
                    <button
                      key={a + i}
                      className="group relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-br from-card/80 to-card/30 p-3 text-left transition-all hover:border-gold/30 hover:shadow-[0_8px_24px_-12px_rgba(212,175,55,0.3)]"
                    >
                      <div className="flex items-center gap-3">
                        <AromaIcon name={a} size={52} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-display text-[13px] leading-tight text-cream">{a}</div>
                          <div className="mt-0.5 truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80">{aromaFamilyLabel(a)}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex flex-1 items-center gap-1">
                          {[1, 2, 3, 4, 5].map((d) => (
                            <span
                              key={d}
                              className={cn(
                                "h-1 flex-1 rounded-full transition-colors",
                                d <= intensity + 1
                                  ? "bg-gradient-to-r from-burgundy to-gold/80"
                                  : "bg-white/8",
                              )}
                            />
                          ))}
                        </div>
                        <span className="font-display text-[10px] uppercase tracking-wider text-gold/80">
                          {intensityLabel(intensity)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section title="Tasting Profile">
              <Card className="bg-card/50 p-4">
                <SliderRow label="Body" leftLabel="Light" rightLabel="Full" value={pct(w.body)} />
                <SliderRow label="Tannins" leftLabel="Low" rightLabel="High" value={pct(w.tannin)} />
                <SliderRow label="Acidity" leftLabel="Low" rightLabel="High" value={pct(w.acidity)} />
                <SliderRow label="Fruit" leftLabel="Low" rightLabel="High" value={pct(w.fruit)} />
              </Card>
            </Section>
          </>
        )}

        {tab === "Overview" && (
          <div className="mt-5 space-y-4">
            {w.description && (
              <Card className="bg-card/50 p-4">
                <p className="font-display text-base leading-relaxed text-cream">{w.description}</p>
              </Card>
            )}
            <KV label="Producer" value={w.producer ?? "—"} />
            <KV label="Region" value={[w.region, w.country].filter(Boolean).join(", ") || "—"} />
            <KV label="Grape" value={w.grape_varieties?.join(", ") ?? "—"} />
            <KV label="Vintage" value={w.vintage ? String(w.vintage) : "—"} />
            <KV label="Serving" value={w.serving_temp ?? "—"} />
            <KV label="Glass" value={w.glass_type ?? "—"} />
          </div>
        )}

        {tab === "Tasting" && (
          <div className="mt-5">
            <Card className="bg-card/50 p-4">
              <SliderRow label="Body" leftLabel="Light" rightLabel="Full" value={pct(w.body)} />
              <SliderRow label="Tannins" leftLabel="Low" rightLabel="High" value={pct(w.tannin)} />
              <SliderRow label="Acidity" leftLabel="Low" rightLabel="High" value={pct(w.acidity)} />
              <SliderRow label="Fruit" leftLabel="Low" rightLabel="High" value={pct(w.fruit)} />
              <SliderRow label="Oak" leftLabel="None" rightLabel="Heavy" value={pct(w.oak)} />
              <SliderRow label="Sweetness" leftLabel="Dry" rightLabel="Sweet" value={pct(w.sweetness)} />
            </Card>
          </div>
        )}

        {tab === "Food" && (
          <div className="mt-5 space-y-3">
            {(w.food_pairings ?? []).map((p, i) => (
              <Card key={i} className="bg-card/50 p-4">
                <p className="font-display text-base text-cream">{p.dish}</p>
                <p className="mt-1 text-xs text-muted-foreground">{p.reason}</p>
              </Card>
            ))}
            {(!w.food_pairings || w.food_pairings.length === 0) && (
              <p className="py-6 text-center text-sm text-muted-foreground">No pairings yet.</p>
            )}
          </div>
        )}

        {tab === "Reviews" && (
          <div className="mt-5">
            <Card className="bg-card/50 p-4 text-center text-sm text-muted-foreground">
              No reviews yet.
            </Card>
          </div>
        )}

        <Button variant="ghost" onClick={remove} className="mt-8 mb-4 w-full text-destructive hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-4 w-4" /> Delete wine
        </Button>
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 font-display text-lg text-cream">{title}</h2>
      {children}
    </section>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-white/8 pb-2.5">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-right font-display text-sm text-cream">{value}</span>
    </div>
  );
}

function SliderRow({ label, leftLabel, rightLabel, value }: { label: string; leftLabel: string; rightLabel: string; value: number }) {
  return (
    <div className="grid grid-cols-[64px_36px_1fr_36px] items-center gap-2 py-2">
      <span className="text-xs text-foreground/80">{label}</span>
      <span className="text-[10px] text-muted-foreground">{leftLabel}</span>
      <div className="relative h-1 rounded-full bg-white/10">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold/80 to-copper" style={{ width: `${value}%` }} />
        <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cream bg-gold shadow" style={{ left: `${value}%` }} />
      </div>
      <span className="text-right text-[10px] text-muted-foreground">{rightLabel}</span>
    </div>
  );
}

function pct(v: number | null): number {
  if (v == null) return 50;
  return Math.max(0, Math.min(100, v * 10));
}

function computeRating(w: { fruit: number | null; tannin: number | null; acidity: number | null; body: number | null }): number {
  const vals = [w.fruit, w.tannin, w.acidity, w.body].filter((v): v is number => v != null);
  if (vals.length === 0) return 4.0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.max(3.5, Math.min(5, 3.5 + (mean / 10) * 1.5));
}

function aromaEmoji(name: string): string {
  const n = name.toLowerCase();
  if (/cherry|berry|plum|currant|strawberry|raspberry/.test(n)) return "🍒";
  if (/oak|wood|cedar|smoke/.test(n)) return "🪵";
  if (/vanilla|cream|butter/.test(n)) return "🍦";
  if (/tobacco|leather|earth/.test(n)) return "🍂";
  if (/apple|pear|citrus|lemon|lime|grape/.test(n)) return "🍏";
  if (/floral|rose|violet/.test(n)) return "🌹";
  if (/spice|pepper|clove|cinnamon/.test(n)) return "🌶️";
  if (/chocolate|cocoa|coffee/.test(n)) return "🍫";
  return "🍇";
}

function aromaFamily(name: string): string {
  const n = name.toLowerCase();
  if (/cherry|berry|plum|currant|strawberry|raspberry|fruit|apple|pear|citrus|lemon|lime|grape/.test(n)) return "Fruit";
  if (/oak|wood|cedar|smoke/.test(n)) return "Oak";
  if (/vanilla|cream|butter|chocolate|cocoa|coffee/.test(n)) return "Sweet";
  if (/tobacco|leather|earth|mushroom/.test(n)) return "Earth";
  if (/floral|rose|violet|jasmine/.test(n)) return "Floral";
  if (/spice|pepper|clove|cinnamon|nutmeg/.test(n)) return "Spice";
  return "Aromatic";
}

function intensityLabel(v: number): string {
  if (v >= 4) return "Strong";
  if (v >= 3) return "Med+";
  if (v >= 2) return "Med";
  return "Light";
}
