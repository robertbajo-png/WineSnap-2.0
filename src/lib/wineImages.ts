const BUCKET = "wine-labels";
const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`;

export function getWineLabelPath(value: string | null | undefined) {
  if (!value) return null;
  if (!value.startsWith("http://") && !value.startsWith("https://")) return value;

  try {
    const url = new URL(value);
    const markerIndex = url.pathname.indexOf(PUBLIC_MARKER);
    if (markerIndex === -1) return null;
    return decodeURIComponent(url.pathname.slice(markerIndex + PUBLIC_MARKER.length));
  } catch {
    return null;
  }
}
