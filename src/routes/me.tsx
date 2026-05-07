import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Settings, Wine, GlassWater, Star, ChevronRight, Camera, Grape, MapPin, BookmarkIcon, LogOut, Languages } from "lucide-react";
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

  const memberSince = user ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "—";

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        <header className="flex items-center justify-between">
          <span className="h-9 w-9" />
          <h1 className="font-display text-xl text-gold">Profile</h1>
          <button aria-label="Settings" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
            <Settings className="h-5 w-5" strokeWidth={1.6} />
          </button>
        </header>

        {/* Avatar + name */}
        <section className="mt-6 flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0 rounded-full border-2 border-gold bg-gradient-to-b from-burgundy/40 to-background/60">
            <div className="flex h-full w-full items-center justify-center font-display text-2xl text-gold">
              {(profile?.display_name ?? user?.email ?? "A")[0].toUpperCase()}
            </div>
            <button className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-gold text-background">
              <Camera className="h-3 w-3" />
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl text-cream">{profile?.display_name ?? user?.email?.split("@")[0] ?? "Guest"}</p>
            <p className="text-xs text-gold">{explorerTier(bottles)}</p>
            <p className="text-[11px] text-muted-foreground">Member since {memberSince}</p>
          </div>
        </section>

        {/* Stats */}
        <section className="mt-5 grid grid-cols-3 gap-2">
          <StatBox icon={<Wine className="h-4 w-4 text-gold" />} value={String(bottles)} label="Bottles" />
          <StatBox icon={<GlassWater className="h-4 w-4 text-gold" />} value={String(tasted)} label="Tasted" />
          <StatBox icon={<Star className="h-4 w-4 fill-gold text-gold" />} value={avg ? avg.toFixed(1) : "—"} label="Avg. Rating" />
        </section>

        {/* Favorites */}
        <section className="mt-7">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg text-gold">Favorites</h2>
            <Link to="/taste" className="text-xs text-burgundy">Edit</Link>
          </div>
          <div className="mt-3 space-y-2.5">
            <FavRow to="/taste" hash="types" icon={<Wine className="h-4 w-4 text-gold" />} label="Wine Types" value={profile?.preferred_types?.length ? profile.preferred_types.join(", ") : "Not set"} />
            <FavRow to="/taste" hash="profile" icon={<BookmarkIcon className="h-4 w-4 text-gold" />} label="Taste Profile" value={tasteProfileSummary(profile) ?? "Not set"} />
            <FavRow to="/taste" hash="regions" icon={<MapPin className="h-4 w-4 text-gold" />} label="Regions" value={profile?.preferred_regions?.length ? profile.preferred_regions.slice(0, 3).join(", ") + (profile.preferred_regions.length > 3 ? ` +${profile.preferred_regions.length - 3}` : "") : "Not set"} />
            <FavRow to="/taste" hash="grapes" icon={<Grape className="h-4 w-4 text-gold" />} label="Grape Varieties" value={topGrapes.length ? topGrapes.slice(0, 2).join(", ") + (topGrapes.length > 2 ? ` +${topGrapes.length - 2}` : "") : "—"} />
          </div>
        </section>

        {/* Recommended For You */}
        <section className="mt-7">
          <h2 className="font-display text-lg text-gold">Recommended For You</h2>
          <p className="mt-1 text-xs text-muted-foreground">Customize how we personalize your recommendations.</p>
          <div className="mt-3 space-y-2.5 pb-4">
            <ToggleRow title="Personalized Recommendations" desc="Get wines tailored to your taste" value={profile?.personalized_recs ?? true} onChange={(v) => updatePref(user?.id, { personalized_recs: v }, setProfile)} />
            <ToggleRow title="New Arrivals Alerts" desc="Be first to know about new releases" value={profile?.new_arrivals_alerts ?? true} onChange={(v) => updatePref(user?.id, { new_arrivals_alerts: v }, setProfile)} />
            <FavRow icon={null} label="Price Range" value={priceRangeLabel(profile?.price_min, profile?.price_max)} />
            <ToggleRow title="Hide Wines I Dislike" desc="Improve results over time" value={profile?.hide_disliked ?? true} onChange={(v) => updatePref(user?.id, { hide_disliked: v }, setProfile)} />
          </div>
        </section>

        {user && (
          <button
            onClick={() => supabase.auth.signOut()}
            className="mb-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 text-sm text-muted-foreground hover:bg-white/5"
          >
            <LogOut className="h-4 w-4" /> Sign out
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

function FavRow({ icon, label, value, to, hash }: { icon: React.ReactNode; label: string; value: string; to?: string; hash?: string }) {
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
  return <button className={className}>{inner}</button>;
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

function explorerTier(bottles: number): string {
  if (bottles >= 100) return "Wine Connoisseur";
  if (bottles >= 25) return "Wine Enthusiast";
  if (bottles >= 5) return "Wine Explorer";
  return "Wine Novice";
}

function priceRangeLabel(min?: number | null, max?: number | null): string {
  if (min == null && max == null) return "Not set";
  const lo = min ?? 0;
  const hi = max ?? null;
  return hi != null ? `$${lo} – $${hi}` : `$${lo}+`;
}

async function updatePref(
  userId: string | undefined,
  patch: Record<string, boolean>,
  setProfile: React.Dispatch<React.SetStateAction<any>>,
) {
  if (!userId) return;
  setProfile((p: any) => ({ ...(p ?? {}), ...patch }));
  await supabase.from("profiles").update(patch as any).eq("id", userId);
}

