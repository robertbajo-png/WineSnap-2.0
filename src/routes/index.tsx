import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ScanLine, Wine, BookOpen, UtensilsCrossed, Sparkles, Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { useT } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import heroBottle from "@/assets/hero-bottle.jpg";
import { WineImage } from "@/components/WineImage";

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
  const { data: dashboard } = useQuery({
    queryKey: ["home-dashboard", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const [profileResult, winesResult, alertsResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("onboarded_at,display_name")
          .eq("id", user!.id)
          .maybeSingle(),
        supabase
          .from("wines")
          .select("id,producer,wine_name,vintage,image_url")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("wishlist")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .not("price_alert_triggered_at", "is", null)
          .is("price_alert_seen_at", null),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (winesResult.error) throw winesResult.error;
      if (alertsResult.error) throw alertsResult.error;
      return {
        profile: profileResult.data,
        wines: winesResult.data ?? [],
        alertCount: alertsResult.count ?? 0,
      };
    },
  });

  useEffect(() => {
    if (user && dashboard?.profile && !dashboard.profile.onboarded_at)
      navigate({ to: "/onboarding" });
  }, [user, dashboard, navigate]);

  const FEATURES = [
    { icon: ScanLine, title: t("home.feat.scan.title"), desc: t("home.feat.scan.desc") },
    { icon: Wine, title: t("home.feat.taste.title"), desc: t("home.feat.taste.desc") },
    { icon: BookOpen, title: t("home.feat.collect.title"), desc: t("home.feat.collect.desc") },
  ] as const;
  if (user && dashboard?.profile?.onboarded_at) {
    return <ReturningHome dashboard={dashboard} email={user.email ?? ""} />;
  }
  return (
    <AppShell width="wide">
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
            <h2 className="font-display text-[34px] leading-tight text-cream">{t("home.title")}</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/75">
              {t("home.subtitle")}
            </p>
          </div>
        </div>

        {/* Feature cards */}
        <div className="px-5 pt-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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

          {/* CTA */}
          <div className="mx-auto max-w-md">
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
      </div>
    </AppShell>
  );
}

function ReturningHome({
  dashboard,
  email,
}: {
  dashboard: {
    profile: { onboarded_at: string | null; display_name: string | null } | null;
    wines: Array<{
      id: string;
      producer: string | null;
      wine_name: string | null;
      vintage: number | null;
      image_url: string | null;
    }>;
    alertCount: number;
  };
  email: string;
}) {
  const t = useT();
  const name = dashboard.profile?.display_name || email.split("@")[0] || t("nav.profile");
  return (
    <AppShell width="wide">
      <header className="flex items-end justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="font-display text-lg text-gold">WineSnap</p>
          <h1 className="mt-1 font-display text-3xl text-cream">
            {t("home.returning.greeting")}, {name}
          </h1>
        </div>
        <Link
          to="/scan"
          className="flex h-11 items-center gap-2 rounded-lg bg-burgundy px-4 text-sm text-cream"
        >
          <ScanLine className="h-4 w-4" /> {t("home.cta.start")}
        </Link>
      </header>

      {dashboard.alertCount > 0 && (
        <Link
          to="/wishlist"
          className="mt-5 flex items-center justify-between border-y border-gold/20 py-3 text-sm text-gold"
        >
          <span className="flex items-center gap-2">
            <Bell className="h-4 w-4" /> {t("home.returning.priceAlerts")}
          </span>
          <strong>{dashboard.alertCount}</strong>
        </Link>
      )}

      <section className="mt-7">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-gold">{t("home.returning.recent")}</h2>
          <Link to="/cellar" className="text-sm text-muted-foreground hover:text-gold">
            {t("nav.cellar")}
          </Link>
        </div>
        {dashboard.wines.length ? (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {dashboard.wines.map((wine) => (
              <li key={wine.id}>
                <Link
                  to="/wine/$id"
                  params={{ id: wine.id }}
                  className="block overflow-hidden rounded-lg border border-white/10 bg-card/40"
                >
                  <div className="aspect-[4/3] bg-background">
                    <WineImage
                      src={wine.image_url}
                      alt={wine.wine_name ?? ""}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-3">
                    <p className="truncate text-xs text-muted-foreground">{wine.producer ?? ""}</p>
                    <p className="truncate font-display text-base text-cream">
                      {wine.wine_name ?? t("common.untitled")} {wine.vintage ?? ""}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">{t("cellar.emptyDesc")}</p>
        )}
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <HomeAction to="/for-you" icon={Sparkles} label={t("nav.forYou")} />
        <HomeAction to="/restaurant" icon={UtensilsCrossed} label={t("home.cta.restaurant")} />
        <HomeAction to="/cellar/overview" icon={Wine} label={t("overview.title")} />
      </section>
    </AppShell>
  );
}

function HomeAction({
  to,
  icon: Icon,
  label,
}: {
  to: "/for-you" | "/restaurant" | "/cellar/overview";
  icon: typeof Wine;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex h-14 items-center gap-3 rounded-lg border border-white/10 bg-card/30 px-4 text-cream hover:border-gold/30"
    >
      <Icon className="h-5 w-5 text-gold" /> <span className="text-sm">{label}</span>
    </Link>
  );
}
