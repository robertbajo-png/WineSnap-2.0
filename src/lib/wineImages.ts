const BUCKET = "wine-labels";
const MARKERS = ["public", "sign", "authenticated"].map(
  (mode) => `/storage/v1/object/${mode}/${BUCKET}/`,
);

export function getWineLabelPath(value: string | null | undefined) {
  if (!value) return null;
  if (!value.startsWith("http://") && !value.startsWith("https://")) return value;

  try {
    const url = new URL(value);
    const marker = MARKERS.find((value) => url.pathname.startsWith(value));
    if (!marker) return null;
    return decodeURIComponent(url.pathname.slice(marker.length));
  } catch {
    return null;
  }
}
