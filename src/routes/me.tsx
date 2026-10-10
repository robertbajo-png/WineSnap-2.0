import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Wine,
  GlassWater,
  Star,
  ChevronRight,
  Grape,
  MapPin,
  BookmarkIcon,
  LogOut,
  Languages,
  Bookmark,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n, useT, type Lang } from "@/i18n";
import { profileStats } from "@/lib/wineRatings";
import { toast } from "sonner";
import { readAllPages } from "@/lib/readAllPages";
import { DataControls } from "@/components/DataControls";

export const Route = createFileRoute("/me")({
  head: () => ({
    meta: [
      { title: "Profile — WineSnap" },
      { name: "description", content: "Your wine profile and preferences." },
    ],
  }),
  component: MePage,
});

type ProfileRow = {
  display_name?: string;
  username?: string | null;
  bio?: string | null;
  is_public?: boolean;
  preferred_types?: string[];
  preferred_regions?: string[];
  preferred_grapes?: string[];
  body?: number | null;
  sweetness?: number | null;
  oak?: number | null;
  tannin?: number | null;
  acidity?: number | null;
  price_min?: number | null;
  price_max?: number | null;
};

function MePage() {
  const { user, loading: authLoading } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [bottles, setBottles] = useState(0);
  const [tasted, setTasted] = useState(0);
  const [avg, setAvg] = useState(0);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const [topGrapes, setTopGrapes] = useState<string[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBottles(0);
    setTasted(0);
    setAvg(0);
    setProfile(null);
    setTopGrapes([]);
    setLoadError(false);
    setStatsLoading(Boolean(user));
    if (!user) return;
    readAllPages(
      (from, to) =>
        supabase
          .from("wines")
          .select(
            "id,user_id,user_rating,quantity,consumed_at,tasting_notes(rating,created_at,user_id)",
          )
          .eq("user_id", user.id)
          .order("id")
          .range(from, to),
      () => cancelled,
    )
      .then((data) => {
        if (cancelled) return;
        setStatsLoading(false);
        const stats = profileStats(data ?? [], user.id);
        setBottles(stats.bottles);
        setTasted(stats.tasted);
        setAvg(stats.average ?? 0);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
          setStatsLoading(false);
        }
      });
    supabase
      .from("profiles")
      .select(
        "display_name,username,bio,is_public,preferred_types,preferred_regions,preferred_grapes,body,sweetness,oak,tannin,acidity,price_min,price_max",
      )
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!cancelled) {
          setProfile(data as ProfileRow);
          if (error) setLoadError(true);
        }
      });
    supabase
      .from("taste_profile")
      .select("favorite_grapes")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const fg = (data?.favorite_grapes ?? {}) as Record<string, number>;
        const sorted = Object.entries(fg)
          .sort((a, b) => b[1] - a[1])
          .map(([g]) => g);
        setTopGrapes(sorted);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const memberSince = user
    ? new Date(user.created_at).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-US", {
        month: "long",
        year: "numeric",
      })
    : "—";

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        <header className="flex items-center justify-between">
          <span className="h-9 w-9" />
          <h1 className="font-display text-2xl text-gold">{t("profile.title")}</h1>
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
            <p className="font-display text-2xl text-cream">
              {profile?.display_name ?? user?.email?.split("@")[0] ?? "Guest"}
            </p>
            <p className="text-sm text-gold">{t(explorerTierKey(bottles))}</p>
            <p className="text-sm text-muted-foreground">
              {t("profile.memberSince")} {memberSince}
            </p>
          </div>
        </section>

        {/* Stats */}
        {loadError && (
          <p role="alert" className="mt-4 text-sm">
            {t("common.error")}
          </p>
        )}
        <section className="mt-5 grid grid-cols-3 gap-2">
          <StatBox
            icon={<Wine className="h-4 w-4 text-gold" />}
            value={authLoading || statsLoading || loadError ? "—" : String(bottles)}
            label={t("profile.bottles")}
          />
          <StatBox
            icon={<GlassWater className="h-4 w-4 text-gold" />}
            value={authLoading || statsLoading || loadError ? "—" : String(tasted)}
            label={t("profile.tasted")}
          />
          <StatBox
            icon={<Star className="h-4 w-4 fill-gold text-gold" />}
            value={avg ? avg.toFixed(1) : "—"}
            label={t("profile.avgRating")}
          />
        </section>

        {/* Favorites */}
        <section className="mt-7">
          <h2 className="font-display text-lg text-gold">{t("profile.favorites")}</h2>
          <div className="mt-3 space-y-2.5">
            <FavRow
              to="/taste"
              hash="types"
              icon={<Wine className="h-4 w-4 text-gold" />}
              label={t("profile.wineTypes")}
              value={
                profile?.preferred_types?.length
                  ? profile.preferred_types.join(", ")
                  : t("profile.notSet")
              }
            />
            <FavRow
              to="/taste"
              hash="profile"
              icon={<BookmarkIcon className="h-4 w-4 text-gold" />}
              label={t("profile.tasteProfile")}
              value={tasteProfileSummary(profile) ?? t("profile.notSet")}
            />
            <FavRow
              to="/taste"
              hash="regions"
              icon={<MapPin className="h-4 w-4 text-gold" />}
              label={t("profile.regions")}
              value={
                profile?.preferred_regions?.length
                  ? profile.preferred_regions.slice(0, 3).join(", ") +
                    (profile.preferred_regions.length > 3
                      ? ` +${profile.preferred_regions.length - 3}`
                      : "")
                  : t("profile.notSet")
              }
            />
            <FavRow
              to="/taste"
              hash="grapes"
              icon={<Grape className="h-4 w-4 text-gold" />}
              label={t("profile.grapes")}
              value={(() => {
                const list = profile?.preferred_grapes?.length
                  ? profile.preferred_grapes
                  : topGrapes;
                return list.length
                  ? list.slice(0, 2).join(", ") + (list.length > 2 ? ` +${list.length - 2}` : "")
                  : t("profile.notSet");
              })()}
            />
            <FavRow
              to="/wishlist"
              icon={<Bookmark className="h-4 w-4 text-gold" />}
              label={t("profile.wishlist")}
              value={t("common.more")}
            />
          </div>
        </section>

        {/* Recommended For You */}
        <section className="mt-7">
          <h2 className="font-display text-lg text-gold">{t("profile.recommended")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("profile.recommendedDesc")}</p>
          <div className="mt-3 space-y-2.5 pb-4">
            <FavRow
              icon={null}
              label={t("profile.priceRange")}
              value={priceRangeLabel(profile?.price_min, profile?.price_max, t("profile.notSet"))}
              onClick={() => editPriceRange(user?.id, profile, setProfile, lang)}
            />
          </div>
        </section>

        {/* Social */}
        <section className="mt-7">
          <h2 className="font-display text-lg text-gold">{t("profile.social")}</h2>
          <div className="mt-3 space-y-2.5">
            <Link
              to="/friends"
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-card/40 px-3.5 py-3 text-left transition-colors hover:bg-card/70"
            >
              <Users className="h-5 w-5 text-gold" />
              <div className="min-w-0 flex-1">
                <p className="text-base text-foreground/90">{t("profile.friends")}</p>
                <p className="text-sm text-muted-foreground">{t("profile.friendsDesc")}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
            <ToggleRow
              title={t("profile.publicProfile")}
              desc={t("profile.publicProfileDesc")}
              value={profile?.is_public ?? false}
              onChange={(v) => updatePref(user?.id, { is_public: v }, setProfile)}
            />
            <TextRow
              label={t("profile.username")}
              placeholder={t("profile.usernamePh")}
              value={profile?.username ?? ""}
              onSave={async (v) => {
                const clean = v.trim().replace(/^@/, "").toLowerCase();
                return updatePref(user?.id, { username: clean || null }, setProfile);
              }}
            />
            <TextRow
              label={t("profile.bio")}
              placeholder={t("profile.bioPh")}
              value={profile?.bio ?? ""}
              onSave={async (v) => {
                return updatePref(user?.id, { bio: v.trim() || null }, setProfile);
              }}
              multiline
            />
          </div>
        </section>

        {/* Language */}
        <section className="mt-2">
          <h2 className="font-display text-lg text-gold">{t("profile.language")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("profile.languageDesc")}</p>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-card/40 p-1.5">
            <Languages className="ml-2 h-4 w-4 text-gold" />
            {(["en", "sv"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`flex-1 rounded-lg px-3 py-2 text-base transition-colors  min-h-11 min-w-11 ${lang === l ? "bg-burgundy/40 text-cream min-h-11 min-w-11" : "text-muted-foreground hover:bg-white/5"}`}
              >
                {l === "en" ? "English" : "Svenska"}
              </button>
            ))}
          </div>
        </section>

        <DataControls />
        {user && (
          <button
            onClick={() => supabase.auth.signOut()}
            className="mt-6 mb-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 text-base text-muted-foreground hover:bg-white/5 min-h-11 min-w-11"
          >
            <LogOut className="h-5 w-5" /> {t("profile.signOut")}
          </button>
        )}
      </div>
    </AppShell>
  );
}

function tasteProfileSummary(
  p: {
    body?: number | null;
    sweetness?: number | null;
    oak?: number | null;
    tannin?: number | null;
    acidity?: number | null;
  } | null,
): string | null {
  if (!p) return null;
  const parts: string[] = [];
  if (p.body != null) parts.push(p.body >= 7 ? "Bold" : p.body <= 4 ? "Light" : "Medium");
  if (p.sweetness != null)
    parts.push(p.sweetness <= 3 ? "Dry" : p.sweetness >= 7 ? "Sweet" : "Off-dry");
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
      <p className="break-words text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function FavRow({
  icon,
  label,
  value,
  to,
  hash,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  to?: string;
  hash?: string;
  onClick?: () => void;
}) {
  const className =
    "flex min-h-14 w-full items-center gap-3 rounded-lg border border-white/10 bg-card/40 px-3.5 py-3 text-left transition-colors hover:bg-card/70";
  const inner = (
    <>
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-base text-foreground/90">{label}</span>
        <span className="mt-1 block break-words text-sm text-muted-foreground">{value}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </>
  );
  if (to)
    return (
      <Link to={to} hash={hash} className={className}>
        {inner}
      </Link>
    );
  return (
    <button onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

function ToggleRow({
  title,
  desc,
  value,
  onChange,
}: {
  title: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-card/40 px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-base text-foreground/90">{title}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={title}
        onClick={() => onChange(!value)}
        className="flex min-h-11 w-14 shrink-0 items-center justify-center rounded-md"
      >
        <span
          className={`relative block h-6 w-11 rounded-full transition-colors ${value ? "bg-success" : "bg-muted-foreground/60"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${value ? "left-[calc(100%-1.375rem)]" : "left-0.5"}`}
          />
        </span>
      </button>
    </div>
  );
}

function TextRow({
  label,
  value,
  placeholder,
  onSave,
  multiline = false,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onSave: (v: string) => Promise<void | boolean> | void | boolean;
  multiline?: boolean;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-card/40 px-3.5 py-3 text-left transition-colors hover:bg-card/70 min-h-11 min-w-11"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-base text-foreground/90">{label}</span>
          <span className="mt-1 block break-words text-sm text-muted-foreground">
            {value ? value : (placeholder ?? "—")}
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-white/10 bg-card/40 px-3.5 py-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      {multiline ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="mt-1 w-full resize-none bg-transparent text-base text-cream placeholder:text-muted-foreground focus:outline-none"
        />
      ) : (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="mt-1 w-full bg-transparent text-base text-cream placeholder:text-muted-foreground focus:outline-none min-h-12"
        />
      )}
      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={() => {
            setDraft(value);
            setEditing(false);
          }}
          className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-white/5 min-h-11 min-w-11"
        >
          {t("common.cancel")}
        </button>
        <button
          onClick={async () => {
            const saved = await onSave(draft);
            if (saved !== false) setEditing(false);
          }}
          className="rounded-lg bg-burgundy px-3 py-1.5 text-sm text-cream min-h-11 min-w-11"
        >
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}

function explorerTierKey(
  bottles: number,
): "tier.connoisseur" | "tier.enthusiast" | "tier.explorer" | "tier.novice" {
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
  patch: Record<string, boolean | number | string | null>,
  setProfile: React.Dispatch<React.SetStateAction<ProfileRow | null>>,
) {
  if (!userId) return;
  const { error } = await supabase
    .from("profiles")
    .update(patch as never)
    .eq("id", userId);
  if (error) {
    toast.error("Kunde inte spara / Could not save");
    return false;
  }
  setProfile((p) => ({ ...((p ?? {}) as ProfileRow), ...patch }) as ProfileRow);
  return true;
}

async function editPriceRange(
  userId: string | undefined,
  profile: ProfileRow | null,
  setProfile: React.Dispatch<React.SetStateAction<ProfileRow | null>>,
  lang: Lang,
) {
  if (!userId) return;
  const promptMin =
    lang === "sv"
      ? "Min-pris ($), lämna tomt för att rensa"
      : "Min price ($), leave empty to clear";
  const promptMax =
    lang === "sv"
      ? "Max-pris ($), lämna tomt för att rensa"
      : "Max price ($), leave empty to clear";
  const minStr = window.prompt(
    promptMin,
    profile?.price_min != null ? String(profile.price_min) : "",
  );
  if (minStr === null) return;
  const maxStr = window.prompt(
    promptMax,
    profile?.price_max != null ? String(profile.price_max) : "",
  );
  if (maxStr === null) return;
  const min = minStr.trim() === "" ? null : Number(minStr);
  const max = maxStr.trim() === "" ? null : Number(maxStr);
  await updatePref(
    userId,
    {
      price_min: Number.isFinite(min as number) ? (min as number) : null,
      price_max: Number.isFinite(max as number) ? (max as number) : null,
    },
    setProfile,
  );
}
