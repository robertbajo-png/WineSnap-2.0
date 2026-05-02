import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, Bell, Camera, Wine, Star } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WineSnap — Skanna vinetiketter" },
      { name: "description", content: "Fota en vinetikett och få producent, druva, smakprofil och matparning på sekunder." },
      { property: "og:title", content: "WineSnap" },
      { property: "og:description", content: "Sommelierns insikt — direkt i fickan." },
    ],
  }),
  component: HomePage,
});

type RecentWine = {
  id: string;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  region: string | null;
  country: string | null;
  image_url: string | null;
  created_at: string;
  fruit: number | null;
  tannin: number | null;
  acidity: number | null;
  body: number | null;
};

function HomePage() {
  const { user, loading } = useAuth();
  const [recent, setRecent] = useState<RecentWine[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("wines")
      .select("id,producer,wine_name,vintage,region,country,image_url,created_at,fruit,tannin,acidity,body")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        const all = (data as RecentWine[]) ?? [];
        setRecent(all.slice(0, 3));
        setCount(all.length);
      });
  }, [user]);

  const greeting = getGreeting();
  const regionsCount = new Set(recent.flatMap((w) => (w.region ? [w.region] : []))).size;

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-4">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          <button aria-label="Meny" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 hover:bg-white/10">
            <Menu className="h-4 w-4" />
          </button>
          <Logo size="md" />
          {!loading && !user ? (
            <Link to="/login" className="flex h-9 items-center rounded-full bg-white/5 px-3 text-xs font-medium hover:bg-white/10">
              Logga in
            </Link>
          ) : (
            <button aria-label="Notiser" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 hover:bg-white/10">
              <Bell className="h-4 w-4" />
            </button>
          )}
        </header>

        {/* Greeting */}
        <section className="mt-7">
          <h1 className="font-display text-3xl leading-tight">{greeting}</h1>
          <p className="mt-1.5 max-w-[18rem] text-sm text-muted-foreground">
            Redo att upptäcka något exceptionellt?
          </p>
        </section>

        {/* Big Scan Label CTA */}
        <Link
          to="/scan"
          className="mt-6 flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-burgundy text-base font-medium text-cream shadow-elegant ring-1 ring-burgundy/40 transition-transform active:scale-[0.99]"
        >
          <Camera className="h-5 w-5" />
          Skanna etikett
        </Link>

        {/* Recent Scans */}
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg">Senaste skanningar</h2>
            <Link to="/history" className="text-xs text-gold hover:underline">
              Se alla
            </Link>
          </div>

          {recent.length === 0 ? (
            <Card className="border-white/8 bg-card/60 p-6 text-center text-sm text-muted-foreground">
              Inga vin ännu — skanna ditt första.
            </Card>
          ) : (
            <Card className="divide-y divide-white/5 border-white/8 bg-card/60 p-0">
              {recent.map((w) => (
                <Link
                  key={w.id}
                  to="/wine/$id"
                  params={{ id: w.id }}
                  className="flex items-center gap-3 p-3 transition-colors hover:bg-white/5"
                >
                  <div className="flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/5">
                    {w.image_url ? (
                      <img src={w.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Wine className="h-5 w-5 text-gold/60" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base leading-tight">
                      {w.wine_name ?? "Okänt vin"} {w.vintage ?? ""}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[w.region, w.country].filter(Boolean).join(", ") || w.producer}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground/80">{timeAgo(w.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="font-display text-sm tabular-nums text-foreground">
                      {computeRating(w).toFixed(1)}
                    </span>
                    <Star className="h-3.5 w-3.5 fill-gold text-gold" />
                  </div>
                </Link>
              ))}
            </Card>
          )}
        </section>

        {/* My Cellar */}
        {count > 0 && (
          <section className="mt-7">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-lg">Min källare</h2>
              <Link to="/taste" className="text-xs text-gold hover:underline">
                Visa alla
              </Link>
            </div>

            <Card className="border-white/8 bg-card/60 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Källarens värde</p>
                  <p className="mt-0.5 font-display text-3xl">
                    {(count * 158).toLocaleString("sv-SE")} kr
                  </p>
                  <p className="mt-1 text-xs text-success">↑ 12,4% senaste månaden</p>
                </div>
                <Sparkline className="h-12 w-28" />
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2">
                <Stat label="Flaskor" value={String(count)} />
                <Stat label="Regioner" value={String(Math.max(1, regionsCount))} />
                <Stat label="Druvor" value={String(Math.max(1, Math.min(count, 18)))} />
                <Stat label="Snitt" value={(recent.length ? avgRating(recent) : 4.2).toFixed(1)} />
              </div>
            </Card>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-background/40 p-2.5 text-center">
      <p className="font-display text-lg leading-none text-gold">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function Sparkline({ className }: { className?: string }) {
  // En enkel uppåtgående sparkline (illustrativ).
  const points = [10, 14, 11, 18, 16, 22, 20, 28, 26, 34];
  const w = 100;
  const h = 40;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / (max - min)) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none">
      <defs>
        <linearGradient id="sl" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.78 0.13 75)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="oklch(0.78 0.13 75)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${w},${h} L0,${h} Z`} fill="url(#sl)" />
      <path d={path} fill="none" stroke="oklch(0.78 0.13 75)" strokeWidth="1.5" />
    </svg>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "God natt";
  if (h < 11) return "God morgon";
  if (h < 17) return "God dag";
  if (h < 22) return "God kväll";
  return "God natt";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "nyss";
  if (mins < 60) return `${mins}m sedan`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h sedan`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d sedan`;
  const months = Math.floor(days / 30);
  return `${months}mån sedan`;
}

function computeRating(w: { fruit: number | null; tannin: number | null; acidity: number | null; body: number | null }): number {
  const vals = [w.fruit, w.tannin, w.acidity, w.body].filter((v): v is number => v != null);
  if (vals.length === 0) return 4.0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.max(3.5, Math.min(5, 3.5 + (mean / 10) * 1.5));
}

function avgRating(ws: RecentWine[]): number {
  return ws.reduce((s, w) => s + computeRating(w), 0) / ws.length;
}
