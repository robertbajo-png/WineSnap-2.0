import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Wine, Sparkles, Heart, ChevronRight, UtensilsCrossed } from "lucide-react";
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
    { icon: Wine, title: t("cellar.title"), to: "/cellar" },
    { icon: Sparkles, title: t("foryou.title"), to: "/for-you" },
    { icon: Heart, title: t("taste.title"), to: "/taste" },
  ] as const;
  return (
    <AppShell>
      <div className="-mx-5 -mt-6 flex flex-col">
        {/* Hero image with overlay */}
        <div className="relative flex min-h-[220px] w-full flex-col justify-between overflow-hidden sm:min-h-[260px]">
          <img
            src={heroBottle}
            alt="Bordeaux wine bottle and glass in a dark cellar"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-background" />

          {/* Brand */}
          <div className="relative flex justify-center pt-6">
            <h1 className="font-display text-3xl text-gold">WineSnap</h1>
          </div>

          {/* Hero copy */}
          <div className="relative mt-6 px-6 pb-6 text-center">
            <h2 className="font-display text-[28px] leading-tight text-cream">{t("home.title")}</h2>
            <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-foreground/75">
              {t("home.subtitle")}
            </p>
          </div>
        </div>

        <div className="px-5 pt-4">
          <ul className="divide-y divide-white/10 border-y border-white/10">
            {FEATURES.map(({ icon: Icon, title, to }) => (
              <li key={to}>
                <Link
                  to={to}
                  className="flex min-h-14 items-center gap-3 py-3 text-base text-cream"
                >
                  <Icon className="h-5 w-5 shrink-0 text-gold" strokeWidth={1.6} />
                  <span className="min-w-0 flex-1 break-words">{title}</span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>

          <Link
            to="/restaurant"
            className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-gold/40 bg-card/40 px-4 py-3 text-base font-medium text-gold transition-colors hover:bg-card"
          >
            <UtensilsCrossed className="h-5 w-5" />
            {t("home.cta.restaurant")}
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
