import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bookmark, Compass, Loader2, Search, Star, UserCheck, UserPlus, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import { WineImage } from "@/components/WineImage";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { recordRecommendationEvent } from "@/lib/recommendationEvents";
import {
  follow,
  getFriendsFeed,
  getSocialDiscovery,
  getSocialWineDiscovery,
  isFollowing,
  searchUsers,
  unfollow,
  type FeedItem,
  type PublicProfile,
  type SocialWine,
} from "@/lib/social";
import { tasteSimilarityLevel, type TasteSimilarity } from "@/lib/socialDiscovery";
import { addToWishlist } from "@/lib/wishlist";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/friends")({
  head: () => ({
    meta: [
      { title: "Discover — WineSnap" },
      {
        name: "description",
        content: "Discover public wines and people whose taste overlaps with yours.",
      },
      { property: "og:title", content: "Discover — WineSnap" },
      {
        property: "og:description",
        content: "Follow wine lovers and discover bottles through trusted taste overlap.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FriendsPage,
});

function FriendsPage() {
  const { user, loading: authLoading } = useAuth();
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<"feed" | "discover">("feed");
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [socialWines, setSocialWines] = useState<SocialWine[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingDiscover, setLoadingDiscover] = useState(false);
  const [discoverLoaded, setDiscoverLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    getFriendsFeed().then(setFeed);
  }, [user]);

  useEffect(() => {
    if (!user || tab !== "discover" || discoverLoaded) return;
    setLoadingDiscover(true);
    getSocialDiscovery(12)
      .then(async (people) => {
        const wines = await getSocialWineDiscovery(18);
        setProfiles(people);
        setSocialWines(wines);
        setDiscoverLoaded(true);
        setLoadingDiscover(false);
      })
      .catch(() => setLoadingDiscover(false));
  }, [discoverLoaded, tab, user]);

  useEffect(() => {
    if (tab !== "discover") return;
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
    setLoadingSearch(true);
    const handle = setTimeout(async () => {
      const found = await searchUsers(term);
      setResults(found);
      setLoadingSearch(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [q, tab]);

  if (!authLoading && !user) {
    return (
      <AppShell>
        <div className="mt-20 text-center">
          <p className="text-muted-foreground">{t("friends.signIn")}</p>
          <Link to="/login">
            <Button className="mt-4 bg-gradient-burgundy text-cream">{t("login.signIn")}</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="flex items-center justify-between">
        <span className="h-9 w-9" />
        <div className="text-center">
          <h1 className="font-display text-2xl text-gold">{t("friends.title")}</h1>
          <p className="text-[11px] text-muted-foreground">{t("friends.subtitle")}</p>
        </div>
        <span className="h-9 w-9" />
      </header>

      <div className="mb-5 flex gap-1 rounded-md border border-white/10 bg-card/40 p-1">
        <TabButton active={tab === "feed"} onClick={() => setTab("feed")}>
          {t("friends.tab.feed")}
        </TabButton>
        <TabButton active={tab === "discover"} onClick={() => setTab("discover")}>
          {t("friends.tab.discover")}
        </TabButton>
      </div>

      {tab === "feed" ? (
        feed === null ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : feed.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t("friends.empty.title")}
            description={t("friends.empty.desc")}
            action={
              <Button onClick={() => setTab("discover")} className="bg-burgundy text-cream">
                <Compass className="h-4 w-4" /> {t("friends.empty.cta")}
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {feed.map((item) => (
              <FeedRow key={item.id} item={item} lang={lang} />
            ))}
          </ul>
        )
      ) : (
        <div>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={t("friends.search.ph")}
              aria-label={t("friends.search.ph")}
              className="w-full rounded-md border border-white/10 bg-card/50 py-3 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-gold focus:outline-none"
            />
          </label>

          {q.trim() ? (
            <div className="mt-4 space-y-2">
              {loadingSearch ? (
                <Skeleton className="h-14 w-full" />
              ) : results.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("friends.search.none")}
                </p>
              ) : (
                results.map((profile) => <UserRow key={profile.id} profile={profile} />)
              )}
            </div>
          ) : loadingDiscover ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-gold" />
              {t("friends.discover.loading")}
            </div>
          ) : (
            <DiscoverySections profiles={profiles} wines={socialWines} />
          )}
        </div>
      )}
    </AppShell>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md px-3 py-2 text-sm transition-colors",
        active ? "bg-burgundy/40 text-cream" : "text-muted-foreground hover:bg-white/5",
      )}
    >
      {children}
    </button>
  );
}

function DiscoverySections({
  profiles,
  wines,
}: {
  profiles: PublicProfile[];
  wines: SocialWine[];
}) {
  const { t } = useI18n();
  const meaningfulProfiles = profiles.filter(
    (profile) => tasteSimilarityLevel(profile) !== "learning" || profile.is_following,
  );

  return (
    <div className="pb-5">
      <section className="mt-6">
        <div>
          <h2 className="font-display text-lg text-cream">{t("friends.discover.people")}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t("friends.discover.peopleDesc")}
          </p>
        </div>
        <div className="mt-3 space-y-2">
          {meaningfulProfiles.length ? (
            meaningfulProfiles
              .slice(0, 6)
              .map((profile) => <UserRow key={profile.id} profile={profile} />)
          ) : (
            <p className="border-l-2 border-gold/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {t("friends.discover.learning")}
            </p>
          )}
        </div>
      </section>

      <section className="mt-7">
        <div>
          <h2 className="font-display text-lg text-cream">{t("friends.discover.wines")}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t("friends.discover.winesDesc")}
          </p>
        </div>
        {wines.length ? (
          <div className="mt-3 space-y-3">
            {wines.slice(0, 12).map((wine) => (
              <SocialWineRow key={wine.wine_id} wine={wine} />
            ))}
          </div>
        ) : (
          <p className="mt-3 py-6 text-center text-xs text-muted-foreground">
            {t("friends.discover.noWines")}
          </p>
        )}
      </section>
    </div>
  );
}

function FeedRow({ item, lang }: { item: FeedItem; lang: "en" | "sv" }) {
  const when = new Date(item.created_at).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-US", {
    month: "short",
    day: "numeric",
  });
  const authorName = item.author?.display_name || item.author?.username || "—";
  const content = (
    <div className="flex gap-3 rounded-md border border-white/10 bg-card/40 p-3">
      <div className="h-20 w-16 shrink-0 overflow-hidden rounded-md bg-background">
        {item.image_url ? (
          <WineImage
            src={item.image_url}
            alt={item.wine_name ?? ""}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[11px] uppercase text-muted-foreground">
            {item.author?.username ? `@${item.author.username}` : authorName}
            <span className="mx-1.5 text-white/20">•</span>
            {when}
          </p>
          <SimilarityBadge similarity={item} compact />
        </div>
        <p className="mt-0.5 truncate font-display text-lg text-cream">
          {item.producer ?? item.wine_name ?? "—"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {[item.wine_name, item.vintage, item.region].filter(Boolean).join(" • ")}
        </p>
        {item.user_rating != null && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-gold">
            <Star className="h-3.5 w-3.5 fill-gold" /> {item.user_rating.toFixed(1)}
          </p>
        )}
      </div>
    </div>
  );
  return item.share_id ? (
    <Link to="/w/$shareId" params={{ shareId: item.share_id }}>
      {content}
    </Link>
  ) : (
    content
  );
}

function UserRow({ profile }: { profile: PublicProfile }) {
  const { t } = useI18n();
  const [following, setFollowing] = useState<boolean | null>(profile.is_following ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile.is_following !== undefined) return;
    isFollowing(profile.id).then(setFollowing);
  }, [profile.id, profile.is_following]);

  const toggle = async () => {
    if (following === null || busy) return;
    setBusy(true);
    const changed = following ? await unfollow(profile.id) : await follow(profile.id);
    if (changed) setFollowing(!following);
    setBusy(false);
  };

  const identity = (
    <>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gradient-to-b from-burgundy/40 to-background/60 font-display text-lg text-gold">
        {(profile.display_name ?? profile.username ?? "?")[0]?.toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm text-cream">{profile.display_name ?? profile.username}</p>
        <div className="mt-0.5 flex items-center gap-2">
          {profile.username && (
            <p className="truncate text-[11px] text-muted-foreground">@{profile.username}</p>
          )}
          <SimilarityBadge similarity={profile} compact />
        </div>
      </div>
    </>
  );

  return (
    <article className="flex items-center gap-3 rounded-md border border-white/10 bg-card/40 p-3">
      {profile.username ? (
        <Link
          to="/u/$username"
          params={{ username: profile.username }}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          {identity}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{identity}</div>
      )}
      <button
        onClick={toggle}
        disabled={busy || following === null}
        aria-label={following ? t("friends.following") : t("friends.follow")}
        title={following ? t("friends.following") : t("friends.follow")}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-40",
          following
            ? "border-white/15 text-muted-foreground hover:bg-white/5"
            : "border-burgundy bg-burgundy text-cream hover:bg-burgundy/90",
        )}
      >
        {following ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
      </button>
    </article>
  );
}

function SocialWineRow({ wine }: { wine: SocialWine }) {
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const similarity: TasteSimilarity = {
    similarity_score: wine.taste_similarity,
    similarity_confidence: wine.similarity_confidence,
    shared_preference_count: wine.shared_preference_count,
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const saved = await addToWishlist({
      producer: wine.producer,
      wine_name: wine.wine_name,
      vintage: wine.vintage,
      region: wine.region,
      country: wine.country,
      wine_type: wine.wine_type,
      grape_varieties: wine.grape_varieties,
      image_url: wine.image_url,
      source: "social",
      ai_data: {
        discovery_source: "social",
        author_id: wine.author_id,
        author_username: wine.author_username,
      },
    });
    if (saved) {
      await recordRecommendationEvent("save", "social", wine, {
        author_id: wine.author_id,
        author_similarity: wine.taste_similarity,
      });
    }
    setSaving(false);
  };

  return (
    <article className="rounded-md border border-white/10 bg-card/40 p-3">
      <div className="flex gap-3">
        <Link
          to="/w/$shareId"
          params={{ shareId: wine.share_id ?? "" }}
          className="flex min-w-0 flex-1 gap-3"
        >
          <div className="h-20 w-16 shrink-0 overflow-hidden rounded-md bg-background">
            {wine.image_url ? (
              <WineImage
                src={wine.image_url}
                alt={wine.wine_name ?? ""}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base text-cream">
              {wine.wine_name ?? wine.producer ?? "—"} {wine.vintage ?? ""}
            </p>
            <p className="truncate text-xs text-gold">
              {[wine.producer, wine.region].filter(Boolean).join(" • ")}
            </p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {wine.author_username
                ? `@${wine.author_username}`
                : (wine.author_display_name ?? "—")}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <SimilarityBadge similarity={similarity} />
              {wine.user_rating != null && (
                <span className="inline-flex items-center gap-1 text-[11px] text-gold">
                  <Star className="h-3 w-3 fill-gold" /> {wine.user_rating.toFixed(1)}
                </span>
              )}
            </div>
          </div>
        </Link>
        <button
          onClick={save}
          disabled={saving}
          aria-label={t("wishlist.saveBtn")}
          title={t("wishlist.saveBtn")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gold/30 text-gold disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Bookmark className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </article>
  );
}

function SimilarityBadge({
  similarity,
  compact = false,
}: {
  similarity: TasteSimilarity;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const level = tasteSimilarityLevel(similarity);
  if (level === "learning" && compact) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px]",
        level === "strong" && "border-success/30 bg-success/10 text-success",
        level === "some" && "border-gold/30 bg-gold/8 text-gold",
        level === "low" && "border-white/10 text-muted-foreground",
        level === "learning" && "border-white/10 text-muted-foreground",
      )}
    >
      {t(`friends.similarity.${level}`)}
    </span>
  );
}
