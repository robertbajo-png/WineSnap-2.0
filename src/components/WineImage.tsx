import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { getWineLabelPath } from "@/lib/wineImages";
import { createWineLabelUrl } from "@/lib/wineImageUrls";
import { supabase } from "@/integrations/supabase/client";

export function WineImage({
  src,
  alt,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined;
  alt: string;
}) {
  const [resolved, setResolved] = useState<{ source: typeof src; url: string } | null>(null);

  useEffect(() => {
    if (!src || !getWineLabelPath(src)) return;
    let active = true;
    let generation = 0;
    let controller: AbortController | undefined;
    let release: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      generation++;
      controller?.abort();
      release?.();
      release = undefined;
      setResolved(null);
    };
    const load = () => {
      clear();
      const version = generation;
      controller = new AbortController();
      void createWineLabelUrl(src, controller.signal)
        .then((image) => {
          if (!active || version !== generation) {
            image?.release();
            return;
          }
          release = image?.release;
          setResolved(image ? { source: src, url: image.url } : null);
        })
        .catch(() => {
          if (active && version === generation) setResolved(null);
        });
    };
    load();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      clear();
      clearTimeout(timer);
      // Avoid calling Auth-dependent APIs inside the synchronous Auth callback.
      timer = setTimeout(load, 0);
    });
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      generation++;
      controller?.abort();
      release?.();
      clearTimeout(timer);
      subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [src]);

  const url = src && !getWineLabelPath(src) ? src : resolved?.source === src ? resolved?.url : null;
  if (!url) return null;
  return <img src={url} alt={alt} {...props} />;
}
