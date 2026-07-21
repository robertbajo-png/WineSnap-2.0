import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, UserPlus, UserCheck, Star } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Wine } from "lucide-react";
import {
  getProfileByUsername,
  getPublicWinesByUser,
  getFollowCounts,
  isFollowing,
  follow,
  unfollow,
  type PublicProfile,
} from "@/lib/social";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/u/$username")({
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} — WineSnap` },
      { name: "description", content: `Public wine profile of @${params.username} on WineSnap.` },
      { property: "og:title", content: `@${params.username} — WineSnap` },
      { property: "og:description", content: `Public wine profile of @${params.username} on WineSnap.` },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UserProfilePage,
});

function UserProfilePage() {
  const { username } = useParams({ from: "/u/$username" });
  const { user } = useAuth();
  const { t } = useI18n();
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const [wines, setWines] = useState<any[]>([]);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await getProfileByUsername(username);
      if (!alive) return;
      setProfile(p);
      if (!p) return;
      const [w, c] = await Promise.all([getPublicWinesByUser(p.id), getFollowCounts(p.id)]);
      if (!alive) return;
      setWines(w);
      setCounts(c);
      if (user && user.id !== p.id) setFollowing(await isFollowing(p.id));
    })();
    return () => {
      alive = false;
    };
  }, [username, user]);

  const toggle = async () => {
    if (!profile || following === null || busy) return;
    setBusy(true);
    if (following) {
      await unfollow(profile.id);
      setFollowing(false);
      setCounts((c) => ({ ...c, followers: Math.max(0, c.followers - 1) }));
    } else {
      await follow(profile.id);
      setFollowing(true);
      setCounts((c) => ({ ...c, followers: c.followers + 1 }));
    }
    setBusy(false);
  };

  return (
    <AppShell>
      <Link to="/friends" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("common.back")}
      </Link>

      {profile === undefined ? (
        <Skeleton className="h-40 w-full" />
      ) : profile === null || !profile.is_public ? (
        <EmptyState icon={Wine} title="—" description={t("friends.profilePrivate")} />
      ) : (
        <>
          <header className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-gold bg-gradient-to-b from-burgundy/40 to-background/60 font-display text-2xl text-gold">
              {(profile.display_name ?? profile.username ?? "?")[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-2xl text-cream">{profile.display_name ?? profile.username}</p>
              {profile.username && <p className="text-xs text-muted-foreground">@{profile.username}</p>}
            </div>
            {user && user.id !== profile.id && following !== null && (
              <button
                onClick={toggle}
                disabled={busy}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs transition-colors ${
                  following ? "border border-white/15 text-muted-foreground hover:bg-white/5" : "bg-burgundy text-cream"
                }`}
              >
                {following ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                {following ? t("friends.following") : t("friends.follow")}
              </button>
            )}
          </header>

          {profile.bio && <p className="mt-3 text-sm text-foreground/85">{profile.bio}</p>}

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat label={t("cellar.bottles")} value={String(wines.length)} />
            <Stat label={t("friends.followers")} value={String(counts.followers)} />
            <Stat label={t("friends.following")} value={String(counts.following)} />
          </div>

          <section className="mt-7">
            <h2 className="font-display text-lg text-gold">{t("friends.publicWines")}</h2>
            {wines.length === 0 ? (
              <p className="mt-3 py-8 text-center text-sm text-muted-foreground">{t("friends.noPublicWines")}</p>
            ) : (
              <ul className="mt-3 grid grid-cols-2 gap-3 pb-6">
                {wines.map((w) => (
                  <li key={w.id}>
                    {w.share_id ? (
                      <Link
                        to="/w/$shareId"
                        params={{ shareId: w.share_id }}
                        className="block overflow-hidden rounded-xl border border-white/10 bg-card/40"
                      >
                        <div className="aspect-[3/4] w-full overflow-hidden bg-background">
                          {w.image_url ? (
                            <img src={w.image_url} alt={w.name ?? ""} className="h-full w-full object-cover" loading="lazy" />
                          ) : null}
                        </div>
                        <div className="p-2.5">
                          <p className="truncate text-[11px] text-muted-foreground">{w.producer ?? ""}</p>
                          <p className="truncate text-sm text-cream">{w.name ?? "—"}</p>
                          {w.user_rating != null && (
                            <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-gold">
                              <Star className="h-3 w-3 fill-gold" /> {w.user_rating.toFixed(1)}
                            </p>
                          )}
                        </div>
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-white/10 bg-card/50 px-2 py-3 text-center">
      <p className="font-display text-xl text-cream">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
