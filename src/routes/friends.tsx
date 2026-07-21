import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, UserPlus, UserCheck, Users, Star } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import {
  searchUsers,
  getFriendsFeed,
  follow,
  unfollow,
  isFollowing,
  type PublicProfile,
  type FeedItem,
} from "@/lib/social";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/friends")({
  head: () => ({
    meta: [
      { title: "Friends — WineSnap" },
      { name: "description", content: "Follow other wine lovers and see what they're drinking." },
      { property: "og:title", content: "Friends — WineSnap" },
      { property: "og:description", content: "Follow other wine lovers and see what they're drinking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FriendsPage,
});

function FriendsPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<"feed" | "discover">("feed");
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  useEffect(() => {
    if (!user) return;
    getFriendsFeed().then(setFeed);
  }, [user]);

  useEffect(() => {
    if (tab !== "discover") return;
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
    setLoadingSearch(true);
    const h = setTimeout(async () => {
      const r = await searchUsers(term);
      setResults(r);
      setLoadingSearch(false);
    }, 250);
    return () => clearTimeout(h);
  }, [q, tab]);

  return (
    <AppShell>
      <header className="mb-4">
        <h1 className="font-display text-3xl text-gold">{t("friends.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("friends.subtitle")}</p>
      </header>

      <div className="mb-5 flex gap-1 rounded-xl border border-white/10 bg-card/40 p-1">
        <TabBtn active={tab === "feed"} onClick={() => setTab("feed")}>
          {t("friends.tab.feed")}
        </TabBtn>
        <TabBtn active={tab === "discover"} onClick={() => setTab("discover")}>
          {t("friends.tab.discover")}
        </TabBtn>
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
            icon={<Users className="h-8 w-8 text-gold" />}
            title={t("friends.empty.title")}
            description={t("friends.empty.desc")}
            action={
              <button
                onClick={() => setTab("discover")}
                className="rounded-full bg-burgundy px-5 py-2.5 text-sm text-cream"
              >
                {t("friends.empty.cta")}
              </button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {feed.map((f) => (
              <FeedRow key={f.id} item={f} lang={lang} />
            ))}
          </ul>
        )
      ) : (
        <div>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("friends.search.ph")}
              className="w-full rounded-xl border border-white/10 bg-card/50 py-3 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-gold focus:outline-none"
            />
          </label>
          <div className="mt-4 space-y-2">
            {loadingSearch ? (
              <Skeleton className="h-14 w-full" />
            ) : q.trim() && results.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("friends.search.none")}</p>
            ) : !q.trim() ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("friends.search.hint")}</p>
            ) : (
              results.map((p) => <UserRow key={p.id} profile={p} />)
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-2 text-sm transition-colors ${
        active ? "bg-burgundy/40 text-cream" : "text-muted-foreground hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

function FeedRow({ item, lang }: { item: FeedItem; lang: "en" | "sv" }) {
  const when = new Date(item.created_at).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-US", {
    month: "short",
    day: "numeric",
  });
  const authorName =
    item.author?.display_name || item.author?.username || "Someone";
  const to = item.share_id ? `/w/${item.share_id}` : null;
  const content = (
    <div className="flex gap-3 rounded-xl border border-white/10 bg-card/40 p-3">
      <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-background">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name ?? ""} className="h-full w-full object-cover" loading="lazy" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {item.author?.username ? (
            <Link to="/u/$username" params={{ username: item.author.username }} className="text-gold hover:underline">
              @{item.author.username}
            </Link>
          ) : (
            authorName
          )}
          <span className="mx-1.5 text-white/20">•</span>
          {when}
        </p>
        <p className="mt-0.5 truncate font-display text-lg text-cream">{item.producer ?? item.name ?? "—"}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[item.name, item.vintage, item.region].filter(Boolean).join(" • ")}
        </p>
        {item.user_rating != null && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-gold">
            <Star className="h-3.5 w-3.5 fill-gold" /> {item.user_rating.toFixed(1)}
          </p>
        )}
      </div>
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

function UserRow({ profile }: { profile: PublicProfile }) {
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    isFollowing(profile.id).then(setFollowing);
  }, [profile.id]);
  const toggle = async () => {
    if (following === null || busy) return;
    setBusy(true);
    if (following) {
      await unfollow(profile.id);
      setFollowing(false);
    } else {
      await follow(profile.id);
      setFollowing(true);
    }
    setBusy(false);
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-card/40 p-3">
      <Link
        to="/u/$username"
        params={{ username: profile.username ?? "" }}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gradient-to-b from-burgundy/40 to-background/60 font-display text-lg text-gold">
          {(profile.display_name ?? profile.username ?? "?")[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm text-cream">{profile.display_name ?? profile.username}</p>
          {profile.username && (
            <p className="truncate text-[11px] text-muted-foreground">@{profile.username}</p>
          )}
        </div>
      </Link>
      <button
        onClick={toggle}
        disabled={busy || following === null}
        className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors ${
          following
            ? "border border-white/15 text-muted-foreground hover:bg-white/5"
            : "bg-burgundy text-cream hover:bg-burgundy/90"
        }`}
      >
        {following ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
        {following ? "Following" : "Follow"}
      </button>
    </div>
  );
}
