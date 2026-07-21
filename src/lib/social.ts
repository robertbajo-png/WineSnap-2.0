import { supabase } from "@/integrations/supabase/client";

export type PublicProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_public: boolean;
};

export async function searchUsers(q: string, limit = 20): Promise<PublicProfile[]> {
  const term = q.trim();
  if (!term) return [];
  const { data } = await supabase
    .from("profiles")
    .select("id,username,display_name,avatar_url,bio,is_public")
    .eq("is_public", true)
    .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
    .limit(limit);
  return (data ?? []) as PublicProfile[];
}

export async function getProfileByUsername(username: string): Promise<PublicProfile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id,username,display_name,avatar_url,bio,is_public")
    .ilike("username", username)
    .maybeSingle();
  return (data as PublicProfile | null) ?? null;
}

export async function follow(targetUserId: string) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  await supabase.from("follows").insert({ follower_id: auth.user.id, following_id: targetUserId });
}

export async function unfollow(targetUserId: string) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  await supabase
    .from("follows")
    .delete()
    .eq("follower_id", auth.user.id)
    .eq("following_id", targetUserId);
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

export async function getFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
  const [{ count: followers }, { count: following }] = await Promise.all([
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId),
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
  ]);
  return { followers: followers ?? 0, following: following ?? 0 };
}

export type FeedItem = {
  id: string;
  producer: string | null;
  name: string | null;
  vintage: number | null;
  region: string | null;
  wine_type: string | null;
  user_rating: number | null;
  image_url: string | null;
  created_at: string;
  share_id: string | null;
  user_id: string;
  author: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
};

export async function getFriendsFeed(limit = 30): Promise<FeedItem[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data: follows } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", auth.user.id);
  const ids = (follows ?? []).map((f: any) => f.following_id as string);
  if (!ids.length) return [];
  const { data } = await supabase
    .from("wines")
    .select("id,producer,name,vintage,region,wine_type,user_rating,image_url,created_at,share_id,user_id")
    .in("user_id", ids)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  const wines = (data ?? []) as any[];
  if (!wines.length) return [];
  const authorIds = Array.from(new Set(wines.map((w) => w.user_id)));
  const { data: profs } = await supabase
    .from("profiles")
    .select("id,username,display_name,avatar_url")
    .in("id", authorIds);
  const byId = new Map<string, any>((profs ?? []).map((p: any) => [p.id, p]));
  return wines.map((w) => ({ ...w, author: byId.get(w.user_id) ?? null }));
}

export async function getPublicWinesByUser(userId: string, limit = 60) {
  const { data } = await supabase
    .from("wines")
    .select("id,producer,name,vintage,region,wine_type,user_rating,image_url,share_id,created_at")
    .eq("user_id", userId)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
