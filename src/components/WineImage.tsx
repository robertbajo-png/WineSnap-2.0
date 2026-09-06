import { useEffect, useState, type ImgHTMLAttributes } from "react";
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

export function WineImage({
  src,
  alt,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined;
  alt: string;
}) {
  const [resolved, setResolved] = useState<string | null>(() => {
    if (!src) return null;
    return getWineLabelPath(src) ? null : src;
  });

  useEffect(() => {
    let active = true;
    setResolved(src && !getWineLabelPath(src) ? src : null);
    void createWineLabelUrl(src).then((url) => {
      if (active) setResolved(url);
    });
    return () => {
      active = false;
    };
  }, [src]);

  if (!resolved) return null;
  return <img src={resolved} alt={alt} {...props} />;
}
