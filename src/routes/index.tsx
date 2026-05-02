import { createFileRoute, Link } from "@tanstack/react-router";
import { Menu, Bell, Scan, Wine, GraduationCap } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Logo } from "@/components/Logo";
import heroCellar from "@/assets/hero-cellar.jpg";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WineSnap — Build your cellar" },
      { name: "description", content: "Scan labels, discover wines, and collect what you love." },
      { property: "og:title", content: "WineSnap — Build your cellar" },
      { property: "og:description", content: "Scan labels, discover wines, and collect what you love." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { user, loading } = useAuth();

  return (
    <AppShell>
      <div className="-mx-5 -mt-6">
        {/* Top bar */}
        <header className="flex items-center justify-between px-5 pt-3">
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

        {/* Hero image with title overlay */}
        <section className="relative mt-2">
          <div className="relative h-[420px] w-full overflow-hidden">
            <img src={heroCellar} alt="" width={1024} height={1280} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-background" />
            <div className="absolute inset-x-0 top-6 text-center">
              <h1 className="font-display text-4xl text-cream drop-shadow-lg">WineSnap</h1>
            </div>
          </div>

          <div className="-mt-10 px-6 text-center">
            <h2 className="font-display text-[32px] leading-[1.1] text-gold">Build your cellar</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Scan labels, discover wines,
              <br />
              and collect what you love.
            </p>
          </div>
        </section>

        {/* Feature cards */}
        <section className="mt-6 grid grid-cols-3 gap-3 px-5">
          <FeatureCard icon={Scan} title="Scan & Discover" desc="Identify wines in seconds" />
          <FeatureCard icon={Wine} title="Taste & Learn" desc="Explore flavors, pairings, and more" />
          <FeatureCard icon={GraduationCap} title="Collect & Grow" desc="Track your bottles and cellar value" />
        </section>

        {/* Carousel dots */}
        <div className="mt-5 flex items-center justify-center gap-1.5">
          <Dot active />
          <Dot />
          <Dot />
        </div>

        {/* CTA */}
        <div className="mt-6 px-5">
          <Link
            to="/scan"
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-burgundy font-display text-lg text-cream shadow-elegant ring-1 ring-burgundy/40 transition-transform active:scale-[0.99]"
          >
            Start Scanning
          </Link>
          <p className="mt-3 text-center text-xs text-burgundy">
            <Link to="/me">I'll set this up later</Link>
          </p>
        </div>
      </div>
    </AppShell>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof Scan;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-gold/15 bg-card/40 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gold/30 text-gold">
        <Icon className="h-4 w-4" strokeWidth={1.6} />
      </div>
      <p className="mt-3 font-display text-[13px] leading-tight text-cream">{title}</p>
      <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground">{desc}</p>
    </div>
  );
}

function Dot({ active = false }: { active?: boolean }) {
  return (
    <span
      className={
        active
          ? "h-1.5 w-5 rounded-full bg-gold"
          : "h-1.5 w-1.5 rounded-full bg-white/20"
      }
    />
  );
}
