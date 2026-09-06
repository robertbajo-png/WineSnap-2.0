import { supabase } from "@/integrations/supabase/client";

export type PublicProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_public: boolean;
};

export type PublicWineSummary = {
  id: string;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  region: string | null;
  wine_type: string | null;
  user_rating: number | null;
  image_url: string | null;
  created_at: string;
  share_id: string | null;
};

function safeSearchTerm(value: string) {
  return value
    .trim()
    .slice(0, 40)
    .replace(/[,%().]/g, " ")
    .trim();
}

export async function searchUsers(q: string, limit = 20): Promise<PublicProfile[]> {
  const term = safeSearchTerm(q);
  if (!term) return [];
  const { data, error } = await supabase
    .from("public_profiles")
    .select("id,username,display_name,avatar_url,bio,is_public")
    .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
    .limit(Math.min(Math.max(limit, 1), 50));
  if (error) throw error;
  return data ?? [];
}

export async function getProfileByUsername(username: string): Promise<PublicProfile | null> {
  if (!username) return null;
  // Preserve legacy names exactly, including spaces, without LIKE wildcards.
  const pattern = username.replace(/[\\%_]/g, "\\$&");
  const { data, error } = await supabase
    .from("public_profiles")
    .select("id,username,display_name,avatar_url,bio,is_public")
    .ilike("username", pattern)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function follow(targetUserId: string) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Authentication required");
  const { error } = await supabase
    .from("follows")
    .insert({ follower_id: auth.user.id, following_id: targetUserId });
  if (error) throw error;
}

export async function unfollow(targetUserId: string) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Authentication required");
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", auth.user.id)
    .eq("following_id", targetUserId);
  if (error) throw error;
}

export async function isFollowing(targetUserId: string): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { data, error } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", auth.user.id)
    .eq("following_id", targetUserId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function getFollowingIds(targetUserIds: string[]): Promise<Set<string>> {
  if (!targetUserIds.length) return new Set();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Set();
  const { data, error } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", auth.user.id)
    .in("following_id", targetUserIds.slice(0, 50));
  if (error) throw error;
  return new Set((data ?? []).map((follow) => follow.following_id));
}

export async function getFollowCounts(
  userId: string,
): Promise<{ followers: number; following: number }> {
  const [followersResult, followingResult] = await Promise.all([
    supabase
      .from("follows")
      .select("id", { count: "exact", head: true })
      .eq("following_id", userId),
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
  ]);
  if (followersResult.error) throw followersResult.error;
  if (followingResult.error) throw followingResult.error;
  return { followers: followersResult.count ?? 0, following: followingResult.count ?? 0 };
}

export type FeedItem = PublicWineSummary & {
  user_id: string;
  author: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export async function getFriendsFeed(limit = 30): Promise<FeedItem[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data: follows, error: followsError } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", auth.user.id);
  if (followsError) throw followsError;
  const ids = (follows ?? []).map((f) => f.following_id);
  if (!ids.length) return [];
  const { data, error: winesError } = await supabase
    .from("public_wines")
    .select(
      "id,producer,wine_name,vintage,region,wine_type,user_rating,image_url,created_at,share_id,user_id",
    )
    .in("user_id", ids)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (winesError) throw winesError;
  const wines = data ?? [];
  if (!wines.length) return [];
  const authorIds = Array.from(new Set(wines.map((w) => w.user_id)));
  const { data: profs, error: profilesError } = await supabase
    .from("public_profiles")
    .select("id,username,display_name,avatar_url")
    .in("id", authorIds);
  if (profilesError) throw profilesError;
  const byId = new Map((profs ?? []).map((p) => [p.id, p]));
  return wines.map((w) => ({ ...w, author: byId.get(w.user_id) ?? null }));
}

export async function getPublicWinesByUser(
  userId: string,
  limit = 60,
): Promise<PublicWineSummary[]> {
  const { data, error } = await supabase
    .from("public_wines")
    .select(
      "id,producer,wine_name,vintage,region,wine_type,user_rating,image_url,share_id,created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;
  return data ?? [];
}
