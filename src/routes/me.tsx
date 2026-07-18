import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Wine, GlassWater, Star, ChevronRight, Grape, MapPin, BookmarkIcon, LogOut, Languages, Bookmark } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n, type Lang } from "@/i18n";

export const Route = createFileRoute("/me")({
  head: () => ({
    meta: [
      { title: "Profile — WineSnap" },
      { name: "description", content: "Your wine profile and preferences." },
    ],
  }),
  component: MePage,
});

function MePage() {
  const { user } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [bottles, setBottles] = useState(0);
  const [tasted, setTasted] = useState(0);
  const [avg, setAvg] = useState(0);
  const [profile, setProfile] = useState<{ display_name?: string; preferred_types?: string[]; preferred_regions?: string[]; body?: number | null; sweetness?: number | null; oak?: number | null; tannin?: number | null; acidity?: number | null; price_min?: number | null; price_max?: number | null; personalized_recs?: boolean; new_arrivals_alerts?: boolean; hide_disliked?: boolean } | null>(null);
  const [topGrapes, setTopGrapes] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("wines")
      .select("id,user_rating,fruit,tannin,acidity,body")
      .then(({ data }) => {
        const ws = data ?? [];
        setBottles(ws.length);
        setTasted(ws.filter((w: any) => w.user_rating != null).length);
        const ratings = ws
          .map((w: any) => {
            if (w.user_rating != null) return w.user_rating;
            const vals = [w.fruit, w.tannin, w.acidity, w.body].filter((v) => v != null);
            if (!vals.length) return null;
            const m = vals.reduce((a, b) => a + b, 0) / vals.length;
            return 3.5 + (m / 10) * 1.5;
          })
          .filter((r): r is number => r != null);
        setAvg(ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0);
      });
    supabase
      .from("profiles")
      .select("display_name,preferred_types,preferred_regions,body,sweetness,oak,tannin,acidity,price_min,price_max,personalized_recs,new_arrivals_alerts,hide_disliked")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data as any));
    supabase
      .from("taste_profile")
      .select("favorite_grapes")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const fg = (data?.favorite_grapes ?? {}) as Record<string, number>;
        const sorted = Object.entries(fg).sort((a, b) => b[1] - a[1]).map(([g]) => g);
        setTopGrapes(sorted);
      });
  }, [user]);

  const memberSince = user ? new Date(user.created_at).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-US", { month: "long", year: "numeric" }) : "—";

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        <header className="flex items-center justify-between">
          <span className="h-9 w-9" />
          <h1 className="font-display text-xl text-gold">{t("profile.title")}</h1>
          <span className="h-9 w-9" />
        </header>

        {/* Avatar + name */}
        <section className="mt-6 flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0 rounded-full border-2 border-gold bg-gradient-to-b from-burgundy/40 to-background/60">
            <div className="flex h-full w-full items-center justify-center font-display text-2xl text-gold">
              {(profile?.display_name ?? user?.email ?? "A")[0].toUpperCase()}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl text-cream">{profile?.display_name ?? user?.email?.split("@")[0] ?? "Guest"}</p>
            <p className="text-xs text-gold">{t(explorerTierKey(bottles))}</p>
            <p className="text-[11px] text-muted-foreground">{t("profile.memberSince")} {memberSince}</p>
          </div>
        </section>

        {/* Stats */}
        <section className="mt-5 grid grid-cols-3 gap-2">
          <StatBox icon={<Wine className="h-4 w-4 text-gold" />} value={String(bottles)} label={t("profile.bottles")} />
          <StatBox icon={<GlassWater className="h-4 w-4 text-gold" />} value={String(tasted)} label={t("profile.tasted")} />
          <StatBox icon={<Star className="h-4 w-4 fill-gold text-gold" />} value={avg ? avg.toFixed(1) : "—"} label={t("profile.avgRating")} />
        </section>

        {/* Favorites */}
        <section className="mt-7">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg text-gold">{t("profile.favorites")}</h2>
            <Link to="/taste" className="text-xs text-burgundy">{t("profile.edit")}</Link>
          </div>
          <div className="mt-3 space-y-2.5">
            <FavRow to="/taste" hash="types" icon={<Wine className="h-4 w-4 text-gold" />} label={t("profile.wineTypes")} value={profile?.preferred_types?.length ? profile.preferred_types.join(", ") : t("profile.notSet")} />
            <FavRow to="/taste" hash="profile" icon={<BookmarkIcon className="h-4 w-4 text-gold" />} label={t("profile.tasteProfile")} value={tasteProfileSummary(profile) ?? t("profile.notSet")} />
            <FavRow to="/taste" hash="regions" icon={<MapPin className="h-4 w-4 text-gold" />} label={t("profile.regions")} value={profile?.preferred_regions?.length ? profile.preferred_regions.slice(0, 3).join(", ") + (profile.preferred_regions.length > 3 ? ` +${profile.preferred_regions.length - 3}` : "") : t("profile.notSet")} />
            <FavRow to="/taste" hash="grapes" icon={<Grape className="h-4 w-4 text-gold" />} label={t("profile.grapes")} value={topGrapes.length ? topGrapes.slice(0, 2).join(", ") + (topGrapes.length > 2 ? ` +${topGrapes.length - 2}` : "") : "—"} />
            <FavRow to="/wishlist" icon={<Bookmark className="h-4 w-4 text-gold" />} label={t("profile.wishlist")} value={t("common.more")} />
          </div>
        </section>

        {/* Recommended For You */}
        <section className="mt-7">
          <h2 className="font-display text-lg text-gold">{t("profile.recommended")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("profile.recommendedDesc")}</p>
          <div className="mt-3 space-y-2.5 pb-4">
            <ToggleRow title={t("profile.personalized")} desc={t("profile.personalizedDesc")} value={profile?.personalized_recs ?? true} onChange={(v) => updatePref(user?.id, { personalized_recs: v }, setProfile)} />
            <ToggleRow title={t("profile.newArrivals")} desc={t("profile.newArrivalsDesc")} value={profile?.new_arrivals_alerts ?? true} onChange={(v) => updatePref(user?.id, { new_arrivals_alerts: v }, setProfile)} />
            <FavRow icon={null} label={t("profile.priceRange")} value={priceRangeLabel(profile?.price_min, profile?.price_max, t("profile.notSet"))} onClick={() => editPriceRange(user?.id, profile, setProfile, lang)} />
            <ToggleRow title={t("profile.hideDisliked")} desc={t("profile.hideDislikedDesc")} value={profile?.hide_disliked ?? true} onChange={(v) => updatePref(user?.id, { hide_disliked: v }, setProfile)} />
          </div>
        </section>

        {/* Language */}
        <section className="mt-2">
          <h2 className="font-display text-lg text-gold">{t("profile.language")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("profile.languageDesc")}</p>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-card/40 p-1.5">
            <Languages className="ml-2 h-4 w-4 text-gold" />
            {(["en", "sv"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm transition-colors ${lang === l ? "bg-burgundy/40 text-cream" : "text-muted-foreground hover:bg-white/5"}`}
              >
                {l === "en" ? "English" : "Svenska"}
              </button>
            ))}
          </div>
        </section>

        {user && (
          <button
            onClick={() => supabase.auth.signOut()}
            className="mt-6 mb-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 text-sm text-muted-foreground hover:bg-white/5"
          >
            <LogOut className="h-4 w-4" /> {t("profile.signOut")}
          </button>
        )}
      </div>
    </AppShell>
  );
}

function tasteProfileSummary(p: { body?: number | null; sweetness?: number | null; oak?: number | null; tannin?: number | null; acidity?: number | null } | null): string | null {
  if (!p) return null;
  const parts: string[] = [];
  if (p.body != null) parts.push(p.body >= 7 ? "Bold" : p.body <= 4 ? "Light" : "Medium");
  if (p.sweetness != null) parts.push(p.sweetness <= 3 ? "Dry" : p.sweetness >= 7 ? "Sweet" : "Off-dry");
  if (p.oak != null && p.oak >= 6) parts.push("Oaked");
  if (p.tannin != null && p.tannin >= 7) parts.push("Tannic");
  if (p.acidity != null && p.acidity >= 7) parts.push("Crisp");
  return parts.length ? parts.slice(0, 3).join(" • ") : null;
}

function StatBox({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-white/10 bg-card/50 px-2 py-3 text-center">
      <div className="mb-1">{icon}</div>
      <p className="font-display text-xl text-cream">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function FavRow({ icon, label, value, to, hash, onClick }: { icon: React.ReactNode; label: string; value: string; to?: string; hash?: string; onClick?: () => void }) {
  const className = "flex w-full items-center gap-3 rounded-xl border border-white/10 bg-card/40 px-3.5 py-3 text-left transition-colors hover:bg-card/70";
  const inner = (
    <>
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="text-sm text-foreground/90">{label}</span>
      <span className="ml-auto truncate text-right text-xs text-muted-foreground">{value}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </>
  );
  if (to) return <Link to={to} hash={hash} className={className}>{inner}</Link>;
  return <button onClick={onClick} className={className}>{inner}</button>;
}

function ToggleRow({ title, desc, value, onChange }: { title: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-card/40 px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground/90">{title}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${value ? "bg-success" : "bg-white/15"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${value ? "left-[calc(100%-1.375rem)]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

function explorerTierKey(bottles: number): "tier.connoisseur" | "tier.enthusiast" | "tier.explorer" | "tier.novice" {
  if (bottles >= 100) return "tier.connoisseur";
  if (bottles >= 25) return "tier.enthusiast";
  if (bottles >= 5) return "tier.explorer";
  return "tier.novice";
}

function priceRangeLabel(min?: number | null, max?: number | null, notSet = "Not set"): string {
  if (min == null && max == null) return notSet;
  const lo = min ?? 0;
  const hi = max ?? null;
  return hi != null ? `$${lo} – $${hi}` : `$${lo}+`;
}

async function updatePref(
  userId: string | undefined,
  patch: Record<string, boolean | number | null>,
  setProfile: React.Dispatch<React.SetStateAction<any>>,
) {
  if (!userId) return;
  setProfile((p: any) => ({ ...(p ?? {}), ...patch }));
  await supabase.from("profiles").update(patch as any).eq("id", userId);
}

async function editPriceRange(
  userId: string | undefined,
  profile: any,
  setProfile: React.Dispatch<React.SetStateAction<any>>,
  lang: Lang,
) {
  if (!userId) return;
  const promptMin = lang === "sv" ? "Min-pris ($), lämna tomt för att rensa" : "Min price ($), leave empty to clear";
  const promptMax = lang === "sv" ? "Max-pris ($), lämna tomt för att rensa" : "Max price ($), leave empty to clear";
  const minStr = window.prompt(promptMin, profile?.price_min != null ? String(profile.price_min) : "");
  if (minStr === null) return;
  const maxStr = window.prompt(promptMax, profile?.price_max != null ? String(profile.price_max) : "");
  if (maxStr === null) return;
  const min = minStr.trim() === "" ? null : Number(minStr);
  const max = maxStr.trim() === "" ? null : Number(maxStr);
  await updatePref(userId, { price_min: Number.isFinite(min as number) ? (min as number) : null, price_max: Number.isFinite(max as number) ? (max as number) : null }, setProfile);
}

