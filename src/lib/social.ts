import { supabase } from "@/integrations/supabase/client";
import { socialDiscoveryRank, type TasteSimilarity } from "@/lib/socialDiscovery";

export type PublicProfile = TasteSimilarity & {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_public: boolean;
  is_following?: boolean;
  recent_public_wines?: number;
};

export async function searchUsers(q: string, limit = 20): Promise<PublicProfile[]> {
  const term = q
    .trim()
    .replace(/[%_,()]/g, "")
    .slice(0, 80);
  if (!term) return [];
  const { data: auth } = await supabase.auth.getUser();
  let query = supabase
    .from("profiles")
    .select("id,username,display_name,avatar_url,bio,is_public")
    .eq("is_public", true)
    .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
    .limit(limit);
  if (auth.user) query = query.neq("id", auth.user.id);
  const { data } = await query;
  return ((data ?? []) as Omit<PublicProfile, keyof TasteSimilarity>[]).map((profile) => ({
    ...profile,
    similarity_score: null,
    similarity_confidence: null,
    shared_preference_count: 0,
  }));
}

export async function getSocialDiscovery(limit = 20): Promise<PublicProfile[]> {
  const { data, error } = await supabase.rpc("get_social_discovery", { _limit: limit });
  if (error) {
    console.error("Could not load social discovery", error);
    return [];
  }
  return (data ?? [])
    .map((profile) => ({
      id: profile.profile_id,
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      bio: profile.bio,
      is_public: true,
      is_following: profile.is_following,
      similarity_score: profile.similarity_score,
      similarity_confidence: profile.similarity_confidence,
      shared_preference_count: profile.shared_preference_count,
      recent_public_wines: profile.recent_public_wines,
    }))
    .sort((left, right) => socialDiscoveryRank(right) - socialDiscoveryRank(left));
}

export async function getProfileByUsername(username: string): Promise<PublicProfile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id,username,display_name,avatar_url,bio,is_public")
    .ilike("username", username)
    .maybeSingle();
  if (!data) return null;
  const { data: auth } = await supabase.auth.getUser();
  let similarity: {
    similarity_score: number;
    confidence: number;
    shared_preference_count: number;
  } | null = null;
  if (auth.user && auth.user.id !== data.id) {
    await supabase.rpc("refresh_my_taste_similarities");
    const { data: similarityRow } = await supabase
      .from("user_taste_similarity")
      .select("similarity_score,confidence,shared_preference_count")
      .eq("user_id", auth.user.id)
      .eq("peer_user_id", data.id)
      .maybeSingle();
    similarity = similarityRow;
  }
  return {
    ...(data as Omit<PublicProfile, keyof TasteSimilarity>),
    similarity_score: similarity?.similarity_score ?? null,
    similarity_confidence: similarity?.confidence ?? null,
    shared_preference_count: similarity?.shared_preference_count ?? 0,
  };
}

export async function follow(targetUserId: string) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || auth.user.id === targetUserId) return false;
  const { error } = await supabase
    .from("follows")
    .insert({ follower_id: auth.user.id, following_id: targetUserId });
  return !error || error.code === "23505";
}

export async function unfollow(targetUserId: string) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", auth.user.id)
    .eq("following_id", targetUserId);
  return !error;
}

export async function isFollowing(targetUserId: string): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { data } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", auth.user.id)
    .eq("following_id", targetUserId)
    .maybeSingle();
  return !!data;
}

export async function getFollowCounts(
  userId: string,
): Promise<{ followers: number; following: number }> {
  const [{ count: followers }, { count: following }] = await Promise.all([
    supabase
      .from("follows")
      .select("id", { count: "exact", head: true })
      .eq("following_id", userId),
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
  ]);
  return { followers: followers ?? 0, following: following ?? 0 };
}

export type FeedItem = TasteSimilarity & {
  id: string;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  region: string | null;
  country: string | null;
  wine_type: string | null;
  grape_varieties: string[] | null;
  user_rating: number | null;
  image_url: string | null;
  created_at: string;
  share_id: string | null;
  user_id: string;
  author: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

type FeedAuthor = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type FeedWine = Omit<FeedItem, "author" | keyof TasteSimilarity>;

export async function getFriendsFeed(limit = 30): Promise<FeedItem[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const discovery = await getSocialDiscovery(50);
  const similarityById = new Map(discovery.map((profile) => [profile.id, profile]));
  const { data: follows } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", auth.user.id);
  const ids = (follows ?? []).map((followRow) => followRow.following_id as string);
  if (!ids.length) return [];
  const { data } = await supabase
    .from("wines")
    .select(
      "id,producer,wine_name,vintage,region,country,wine_type,grape_varieties,user_rating,image_url,created_at,share_id,user_id",
    )
    .in("user_id", ids)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  const wines = (data ?? []) as FeedWine[];
  if (!wines.length) return [];
  const authorIds = Array.from(new Set(wines.map((wine) => wine.user_id)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,username,display_name,avatar_url")
    .in("id", authorIds);
  const byId = new Map<string, FeedAuthor>(
    (profiles ?? []).map((profile) => [profile.id, profile as FeedAuthor]),
  );
  return wines.map((wine) => {
    const similarity = similarityById.get(wine.user_id);
    return {
      ...wine,
      author: byId.get(wine.user_id) ?? null,
      similarity_score: similarity?.similarity_score ?? null,
      similarity_confidence: similarity?.similarity_confidence ?? null,
      shared_preference_count: similarity?.shared_preference_count ?? 0,
    };
  });
}

export type SocialWine = {
  wine_id: string;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  region: string | null;
  country: string | null;
  wine_type: string | null;
  grape_varieties: string[] | null;
  image_url: string | null;
  share_id: string | null;
  user_rating: number | null;
  created_at: string;
  author_id: string;
  author_username: string | null;
  author_display_name: string | null;
  is_following: boolean;
  taste_similarity: number | null;
  similarity_confidence: number | null;
  shared_preference_count: number;
};

export async function getSocialWineDiscovery(limit = 30): Promise<SocialWine[]> {
  const { data, error } = await supabase.rpc("get_social_wine_discovery", { _limit: limit });
  if (error) {
    console.error("Could not load social wine discovery", error);
    return [];
  }
  return (data ?? []) as SocialWine[];
}

export type PublicWine = {
  id: string;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  region: string | null;
  wine_type: string | null;
  user_rating: number | null;
  image_url: string | null;
  share_id: string | null;
  created_at: string;
};

export async function getPublicWinesByUser(userId: string, limit = 60): Promise<PublicWine[]> {
  const { data } = await supabase
    .from("wines")
    .select(
      "id,producer,wine_name,vintage,region,wine_type,user_rating,image_url,share_id,created_at",
    )
    .eq("user_id", userId)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as PublicWine[];
}
