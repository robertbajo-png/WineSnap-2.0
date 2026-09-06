import { supabase } from "@/integrations/supabase/client";
import { getWineLabelPath } from "@/lib/wineImages";

const BUCKET = "wine-labels";
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function createWineLabelUrl(value: string | null | undefined) {
  if (!value) return null;
  const path = getWineLabelPath(value);
  if (!path) return value;

  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) return null;
  signedUrlCache.set(path, {
    url: data.signedUrl,
    expiresAt: Date.now() + (SIGNED_URL_TTL_SECONDS - 5 * 60) * 1000,
  });
  return data.signedUrl;
}
