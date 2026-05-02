import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Settings, Wine, GlassWater, Star, ChevronRight, Camera, Grape, MapPin, BookmarkIcon, LogOut } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  const [bottles, setBottles] = useState(0);
  const [tasted, setTasted] = useState(0);
  const [avg, setAvg] = useState(0);
  const [profile, setProfile] = useState<{ display_name?: string; preferred_types?: string[]; preferred_regions?: string[] } | null>(null);

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
      .select("display_name,preferred_types,preferred_regions")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data as any));
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
            <p className="text-xs text-gold">Wine Explorer</p>
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
            <FavRow icon={<Wine className="h-4 w-4 text-gold" />} label="Wine Types" value={(profile?.preferred_types ?? ["Red", "White"]).join(", ")} />
            <FavRow icon={<BookmarkIcon className="h-4 w-4 text-gold" />} label="Taste Profile" value="Bold • Dry • Oaked" />
            <FavRow icon={<MapPin className="h-4 w-4 text-gold" />} label="Regions" value={(profile?.preferred_regions ?? ["Bordeaux", "Tuscany"]).slice(0, 3).join(", ") + ((profile?.preferred_regions?.length ?? 0) > 3 ? ` +${(profile!.preferred_regions!.length) - 3}` : "")} />
            <FavRow icon={<Grape className="h-4 w-4 text-gold" />} label="Grape Varieties" value="Cabernet Sauvignon, Pinot Noir +3" />
          </div>
        </section>

        {/* Recommended For You */}
        <section className="mt-7">
          <h2 className="font-display text-lg text-gold">Recommended For You</h2>
          <p className="mt-1 text-xs text-muted-foreground">Customize how we personalize your recommendations.</p>
          <div className="mt-3 space-y-2.5 pb-4">
            <ToggleRow title="Personalized Recommendations" desc="Get wines tailored to your taste" defaultOn />
            <ToggleRow title="New Arrivals Alerts" desc="Be first to know about new releases" defaultOn />
            <FavRow icon={null} label="Price Range" value="$20 – $200+" />
            <ToggleRow title="Hide Wines I Dislike" desc="Improve results over time" defaultOn />
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

function StatBox({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-white/10 bg-card/50 px-2 py-3 text-center">
      <div className="mb-1">{icon}</div>
      <p className="font-display text-xl text-cream">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function FavRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <button className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-card/40 px-3.5 py-3 text-left transition-colors hover:bg-card/70">
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="text-sm text-foreground/90">{label}</span>
      <span className="ml-auto truncate text-right text-xs text-muted-foreground">{value}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function ToggleRow({ title, desc, defaultOn = false }: { title: string; desc: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-card/40 px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground/90">{title}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
      <button
        onClick={() => setOn(!on)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-success" : "bg-white/15"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[calc(100%-1.375rem)]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
