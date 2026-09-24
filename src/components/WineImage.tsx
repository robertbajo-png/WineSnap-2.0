import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { supabase } from "@/integrations/supabase/client";
import { wineImageStoragePath } from "@/lib/wineImages";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined;
  storagePath?: string | null;
};

const SIGNED_URL_SECONDS = 60 * 60;

export function WineImage({ src, storagePath, ...props }: Props) {
  const managedPath = storagePath || wineImageStoragePath(src);
  const [resolved, setResolved] = useState<string | null>(() =>
    managedPath ? null : (src ?? null),
  );

  useEffect(() => {
    let active = true;
    if (!managedPath) {
      setResolved(src ?? null);
      return () => {
        active = false;
      };
    }

    setResolved(null);
    void supabase.storage
      .from("wine-labels")
      .createSignedUrl(managedPath, SIGNED_URL_SECONDS)
      .then(({ data, error }) => {
        if (!active) return;
        setResolved(error ? null : (data?.signedUrl ?? null));
      });

    return () => {
      active = false;
    };
  }, [managedPath, src]);

  if (!resolved) return null;
  return <img {...props} src={resolved} />;
}
