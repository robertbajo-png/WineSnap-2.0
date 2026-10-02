import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { supabase } from "@/integrations/supabase/client";
import { downloadWineImage } from "@/lib/wineImageUrls";
import { wineImageStoragePath } from "@/lib/wineImages";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined;
  storagePath?: string | null;
};

export function WineImage({ src, storagePath, ...props }: Props) {
  const managedPath = storagePath || wineImageStoragePath(src);
  const [resolved, setResolved] = useState<{
    path: string;
    url: string;
  } | null>(null);

  useEffect(() => {
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
      if (!managedPath) return;
      const current = generation;
      controller = new AbortController();
      void downloadWineImage(managedPath, controller.signal)
        .then((image) => {
          if (!active || current !== generation) {
            image?.release();
            return;
          }
          if (image) {
            release = image.release;
            setResolved({ path: managedPath, url: image.url });
          }
        })
        .catch(() => {
          // Failed or revoked reads leave no cached private image on screen.
        });
    };
    load();
    const { data } = supabase.auth.onAuthStateChange(() => {
      clear();
      clearTimeout(timer);
      // Run outside the auth callback to avoid waiting on its session lock.
      timer = setTimeout(load, 0);
    });
    window.addEventListener("focus", load);

    return () => {
      active = false;
      generation++;
      controller?.abort();
      release?.();
      clearTimeout(timer);
      data.subscription.unsubscribe();
      window.removeEventListener("focus", load);
    };
  }, [managedPath, src]);

  const url = managedPath ? (resolved?.path === managedPath ? resolved.url : null) : src;
  if (!url) return null;
  return <img {...props} src={url} />;
}
