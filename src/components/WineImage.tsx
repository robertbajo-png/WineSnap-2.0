import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { getWineLabelPath } from "@/lib/wineImages";
import { createWineLabelUrl } from "@/lib/wineImageUrls";

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
