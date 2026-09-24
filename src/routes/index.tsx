import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, Camera, ChevronRight, Clock3, Grape, ScanLine, Sparkles, Star, Wine, type LucideIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Logo } from "@/components/Logo";
import heroBottle from "@/assets/hero-bottle.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WineSnap - Cellar dashboard" },
      { name: "description", content: "Scan labels, understand wine profiles, and manage your cellar." },
    ],
  }),
  component: HomePage,
});

const RECENT = [
  { name: "Chateau Verdant", vintage: "2019", region: "Bordeaux, France", match: "95%", note: "Black cherry, oak" },
  { name: "Barolo Riserva", vintage: "2016", region: "Piedmont, Italy", match: "91%", note: "Plum, leather" },
  { name: "Napa Cabernet", vintage: "2020", region: "Napa Valley, USA", match: "88%", note: "Cassis, cedar" },
];

function HomePage() {
  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-4">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Good evening</p>
            <Logo size="md" className="mt-0.5 block" />
          </div>
          <Link
            to="/scan"
            aria-label="Scan label"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold shadow-soft"
          >
            <Camera className="h-5 w-5" strokeWidth={1.7} />
          </Link>
        </header>

        <section className="relative mt-5 overflow-hidden rounded-2xl border border-white/10 bg-card/70 shadow-elegant">
          <img src={heroBottle} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/88 to-background/20" />
          <div className="relative min-h-[210px] p-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-success/25 bg-success/10 px-3 py-1 text-[11px] font-medium text-success">
              <Sparkles className="h-3.5 w-3.5" />
              Cellar value up 12.4%
            </div>
            <h1 className="mt-5 max-w-[220px] font-display text-[34px] leading-none text-cream">
              Build your cellar
            </h1>
            <p className="mt-2 max-w-[220px] text-sm leading-relaxed text-foreground/72">
              Snap a label, decode the tasting profile, and save bottles worth remembering.
            </p>
            <Link
              to="/scan"
              className="mt-5 inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-burgundy px-4 font-display text-base text-cream shadow-gold-ring"
            >
              <ScanLine className="h-4 w-4" />
              Scan Label
            </Link>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-3 gap-2">
          <Metric icon={Wine} label="Bottles" value="156" />
          <Metric icon={BarChart3} label="Cellar Value" value="$24.8k" />
          <Metric icon={Star} label="Avg. Rating" value="4.4" />
        </section>

        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl text-cream">Recent Scans</h2>
            <Link to="/history" className="text-xs text-gold">View all</Link>
          </div>
          <div className="mt-3 space-y-2.5">
            {RECENT.map((wine) => (
              <Link
                key={wine.name}
                to="/search"
                className="cellar-panel flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-card/80"
              >
                <div className="flex h-[70px] w-[48px] shrink-0 items-center justify-center rounded-md border border-copper/20 bg-gradient-to-b from-burgundy/55 to-background">
                  <Wine className="h-5 w-5 text-gold/70" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base leading-tight text-cream">
                    {wine.name} {wine.vintage}
                  </p>
                  <p className="truncate text-xs text-gold">{wine.region}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Grape className="h-3 w-3 text-copper" />
                    {wine.note}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-lg leading-none text-success">{wine.match}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Match</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-5 mb-4 grid grid-cols-2 gap-3">
          <Link to="/cellar/overview" className="cellar-panel rounded-xl p-4">
            <BarChart3 className="h-5 w-5 text-gold" />
            <p className="mt-3 font-display text-lg text-cream">Cellar Value</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Regions, drinking windows, and bottle value.</p>
          </Link>
          <Link to="/taste" className="cellar-panel rounded-xl p-4">
            <Clock3 className="h-5 w-5 text-gold" />
            <p className="mt-3 font-display text-lg text-cream">Taste Profile</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Tune boldness, oak, tannin, and acidity.</p>
          </Link>
        </section>
      </div>
    </AppShell>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="cellar-panel rounded-xl px-2 py-3 text-center">
      <Icon className="mx-auto h-4 w-4 text-gold" strokeWidth={1.7} />
      <p className="mt-1.5 font-display text-lg leading-none text-cream">{value}</p>
      <p className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
