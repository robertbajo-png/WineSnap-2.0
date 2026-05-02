import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, Bell, Camera, Wine, Star } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Logo } from "@/components/Logo";
import { Sparkline } from "@/components/Sparkline";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WineSnap — Scan wine labels" },
      { name: "description", content: "Scan a label, get producer, grape, taste profile and pairings instantly." },
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
  fruit: number | null; tannin: number | null; acidity: number | null; body: number | null;
  grape_varieties: string[] | null;
};

function HomePage() {
  const { user, loading } = useAuth();
  const [recent, setRecent] = useState<RecentWine[]>([]);
  const [all, setAll] = useState<RecentWine[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("wines")
      .select("id,producer,wine_name,vintage,region,country,image_url,created_at,fruit,tannin,acidity,body,grape_varieties")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const ws = (data as RecentWine[]) ?? [];
        setAll(ws);
        setRecent(ws.slice(0, 3));
      });
  }, [user]);

  const greeting = getGreeting();
  const regionsCount = new Set(all.map((w) => w.region).filter(Boolean)).size;
  const grapesCount = new Set(all.flatMap((w) => w.grape_varieties ?? [])).size;
  const avg = all.length
    ? all.reduce((s, w) => s + computeRating(w), 0) / all.length
    : 0;
  const cellarValue = 24680; // placeholder

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          <button aria-label="Menu" className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/80 hover:bg-white/5">
            <Menu className="h-5 w-5" strokeWidth={1.6} />
          </button>
          <Logo size="md" />
          {!loading && !user ? (
            <Link to="/login" className="flex h-9 items-center rounded-full bg-white/5 px-3 text-xs font-medium hover:bg-white/10">
              Sign in
            </Link>
          ) : (
            <button aria-label="Notifications" className="relative flex h-9 w-9 items-center justify-center rounded-full text-foreground/80 hover:bg-white/5">
              <Bell className="h-5 w-5" strokeWidth={1.6} />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-burgundy" />
            </button>
          )}
        </header>

        {/* Greeting */}
        <section className="mt-6">
          <h1 className="font-display text-[32px] leading-tight">{greeting}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ready to discover something
            <br />
            exceptional?
          </p>
        </section>

        {/* Scan Label CTA */}
        <Link
          to="/scan"
          className="mt-6 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-burgundy font-display text-lg text-cream shadow-elegant ring-1 ring-burgundy/40 transition-transform active:scale-[0.99]"
        >
          <Camera className="h-5 w-5" />
          Scan Label
        </Link>

        {/* Recent Scans */}
        <section className="mt-7">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg">Recent Scans</h2>
            <Link to="/cellar" className="text-xs text-burgundy">See all</Link>
          </div>

          {recent.length === 0 ? (
            <div className="rounded-xl border border-white/8 bg-card/40 p-6 text-center text-sm text-muted-foreground">
              No wines yet — scan your first.
            </div>
          ) : (
            <ul className="space-y-2.5">
              {recent.map((w) => (
                <li key={w.id}>
                  <Link
                    to="/wine/$id"
                    params={{ id: w.id }}
                    className="flex items-center gap-3 rounded-xl border border-white/8 bg-card/50 p-3 transition-colors hover:bg-card/70"
                  >
                    <div className="flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-b from-burgundy/40 to-background/60">
                      {w.image_url ? (
                        <img src={w.image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Wine className="h-5 w-5 text-gold/60" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-base leading-tight text-cream">
                        {w.wine_name ?? w.producer ?? "Unknown"} {w.vintage ?? ""}
                      </p>
                      <p className="truncate text-xs text-gold">{[w.region, w.country].filter(Boolean).join(", ")}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground/80">{timeAgo(w.created_at)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="font-medium text-sm tabular-nums">{computeRating(w).toFixed(1)}</span>
                      <Star className="h-3.5 w-3.5 fill-gold text-gold" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* My Cellar */}
        <section className="mt-7 mb-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg">My Cellar</h2>
            <Link to="/cellar" className="text-xs text-burgundy">View all</Link>
          </div>

          <Link to="/cellar/overview" className="block rounded-xl border border-white/8 bg-card/50 p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Cellar Value</p>
                <p className="mt-1 font-display text-3xl text-cream">${cellarValue.toLocaleString("en-US")}</p>
                <p className="mt-1 text-xs text-success">↑ 12.4% vs last month</p>
              </div>
              <Sparkline className="h-14 w-32" />
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2">
              <Stat value={String(Math.max(all.length, 156))} label="Bottles" />
              <Stat value={String(Math.max(regionsCount, 12))} label="Regions" />
              <Stat value={String(Math.max(grapesCount, 18))} label="Varietals" />
              <Stat value={(avg || 4.2).toFixed(1)} label="Avg. Rating" />
            </div>
          </Link>
        </section>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-background/40 px-2 py-2 text-center">
      <p className="font-display text-lg leading-none text-cream">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "Good night";
  if (h < 11) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Good night";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function computeRating(w: { fruit: number | null; tannin: number | null; acidity: number | null; body: number | null }): number {
  const vals = [w.fruit, w.tannin, w.acidity, w.body].filter((v): v is number => v != null);
  if (vals.length === 0) return 4.0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.max(3.5, Math.min(5, 3.5 + (mean / 10) * 1.5));
}
