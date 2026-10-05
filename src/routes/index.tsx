import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Sparkles, UtensilsCrossed } from "lucide-react";
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

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 flex min-h-[calc(100svh-var(--bottom-nav-height)-env(safe-area-inset-top,0px)-1rem)] flex-col">
        {/* Hero image with overlay */}
        <div className="relative flex min-h-[320px] w-full flex-1 flex-col justify-between overflow-hidden sm:min-h-[360px]">
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
          <ul className="grid grid-cols-2 divide-x divide-white/10 border-y border-white/10">
            <li className="min-w-0">
              <Link
                to="/for-you"
                className="flex h-full min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-2 py-3 text-center text-base font-medium leading-snug text-cream transition-colors hover:bg-white/5 hover:text-gold"
              >
                <Sparkles aria-hidden className="h-5 w-5 shrink-0 text-gold" strokeWidth={1.6} />
                <span className="w-full min-w-0 break-words">{t("nav.forYou")}</span>
              </Link>
            </li>
            <li className="min-w-0">
              <Link
                to="/restaurant"
                className="flex h-full min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-2 py-3 text-center text-base font-medium leading-snug text-cream transition-colors hover:bg-white/5 hover:text-gold"
              >
                <UtensilsCrossed
                  aria-hidden
                  className="h-5 w-5 shrink-0 text-gold"
                  strokeWidth={1.6}
                />
                <span className="w-full min-w-0 break-words">{t("home.cta.restaurant")}</span>
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
