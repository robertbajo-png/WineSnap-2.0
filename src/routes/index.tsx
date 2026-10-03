import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ScanLine, Wine, BookOpen, UtensilsCrossed } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useT } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
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
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data && !data.onboarded_at) navigate({ to: "/onboarding" });
      });
  }, [user, navigate]);

  const FEATURES = [
    { icon: ScanLine, title: t("home.feat.scan.title"), desc: t("home.feat.scan.desc") },
    { icon: Wine, title: t("home.feat.taste.title"), desc: t("home.feat.taste.desc") },
    { icon: BookOpen, title: t("home.feat.collect.title"), desc: t("home.feat.collect.desc") },
  ] as const;
  return (
    <AppShell>
      <div className="-mx-5 -mt-6 flex flex-col">
        {/* Hero image with overlay */}
        <div className="relative h-[38svh] min-h-[280px] max-h-[360px] w-full overflow-hidden">
          <img
            src={heroBottle}
            alt="Bordeaux wine bottle and glass in a dark cellar"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-background" />

          {/* Brand */}
          <div className="absolute inset-x-0 top-0 flex justify-center pt-6">
            <h1 className="font-display text-3xl text-gold">WineSnap</h1>
          </div>

          {/* Hero copy */}
          <div className="absolute inset-x-0 bottom-6 px-6 text-center">
            <h2 className="font-display text-[28px] leading-tight text-cream">{t("home.title")}</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/75">
              {t("home.subtitle")}
            </p>
          </div>
        </div>

        <div className="px-5 pt-4">
          <ul className="grid grid-cols-3 gap-3 border-y border-white/10 py-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex min-w-0 flex-col items-center text-center">
                <div className="flex h-8 w-8 items-center justify-center">
                  <Icon className="h-5 w-5 text-gold" strokeWidth={1.6} />
                </div>
                <p className="mt-1 text-xs font-medium leading-snug text-cream">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
              </li>
            ))}
          </ul>

          <Link
            to="/restaurant"
            className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-gold/40 bg-card/40 px-4 py-3 text-sm font-medium text-gold transition-colors hover:bg-card"
          >
            <UtensilsCrossed className="h-4 w-4" />
            {t("home.cta.restaurant")}
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
