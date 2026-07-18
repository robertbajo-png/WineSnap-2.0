import { createFileRoute, Link } from "@tanstack/react-router";
import { ScanLine, Wine, BookOpen } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useT } from "@/i18n";
import heroBottle from "@/assets/hero-bottle.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WineSnap — Build your cellar" },
      { name: "description", content: "Scan labels, discover wines, and collect what you love." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const t = useT();
  const FEATURES = [
    { icon: ScanLine, title: t("home.feat.scan.title"), desc: t("home.feat.scan.desc") },
    { icon: Wine, title: t("home.feat.taste.title"), desc: t("home.feat.taste.desc") },
    { icon: BookOpen, title: t("home.feat.collect.title"), desc: t("home.feat.collect.desc") },
  ] as const;
  return (
    <AppShell>
      <div className="-mx-5 -mt-6 flex min-h-[calc(100vh-7rem)] flex-col">
        {/* Hero image with overlay */}
        <div className="relative h-[58vh] min-h-[420px] w-full overflow-hidden">
          <img
            src={heroBottle}
            alt="Bordeaux wine bottle and glass in a dark cellar"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-background" />

          {/* Brand */}
          <div className="absolute inset-x-0 top-0 flex justify-center pt-6">
            <h1 className="font-display text-2xl text-gold">WineSnap</h1>
          </div>

          {/* Hero copy */}
          <div className="absolute inset-x-0 bottom-6 px-6 text-center">
            <h2 className="font-display text-[34px] leading-tight text-cream">
              {t("home.title")}
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/75">
              {t("home.subtitle")}
            </p>
          </div>
        </div>

        {/* Feature cards */}
        <div className="px-5 pt-5">
          <div className="grid grid-cols-3 gap-2.5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="flex flex-col items-center rounded-2xl border border-white/10 bg-card/50 p-3 text-center"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-gold/40 bg-background/60">
                  <Icon className="h-5 w-5 text-gold" strokeWidth={1.6} />
                </div>
                <p className="mt-2 font-display text-[13px] leading-tight text-cream">{title}</p>
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>

          {/* Pagination dots */}
          <div className="mt-4 flex justify-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
          </div>

          {/* CTA */}
          <Link
            to="/scan"
            className="mt-5 flex h-[52px] w-full items-center justify-center rounded-2xl bg-gradient-burgundy font-display text-lg text-cream shadow-elegant ring-1 ring-burgundy/40"
          >
            {t("home.cta.start")}
          </Link>

          <Link
            to="/restaurant"
            className="mt-3 flex h-[46px] w-full items-center justify-center gap-2 rounded-2xl border border-gold/40 bg-card/40 font-display text-sm text-gold"
          >
            <UtensilsCrossed className="h-4 w-4" />
            {t("home.cta.restaurant")}
          </Link>

          <Link
            to="/cellar"
            className="mt-3 mb-4 block text-center font-display text-sm text-gold"
          >
            {t("home.cta.later")}
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
