const BUCKET = "wine-labels";
const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`;
const SIGNED_MARKER = `/storage/v1/object/sign/${BUCKET}/`;

export function wineImageStoragePath(value: string | null | undefined): string | null {
  const input = value?.trim();
  if (!input || input.startsWith("data:") || input.startsWith("blob:")) return null;

  const marker = input.includes(PUBLIC_MARKER)
    ? PUBLIC_MARKER
    : input.includes(SIGNED_MARKER)
      ? SIGNED_MARKER
      : null;
  if (marker) {
    const encoded = input.split(marker)[1]?.split("?")[0];
    if (!encoded) return null;
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }

  if (/^https?:\/\//i.test(input) || input.startsWith("/")) return null;
  return input.replace(/^wine-labels\//, "");
}

export function isManagedWineImage(value: string | null | undefined) {
  return wineImageStoragePath(value) !== null;
}
