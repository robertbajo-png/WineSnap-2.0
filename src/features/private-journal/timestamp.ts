function wallWithSeconds(wall: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(wall)) return "";
  return wall.length === 16 ? wall + ":00" : wall;
}

function formatOffset(westMinutes: number) {
  const absolute = Math.abs(westMinutes);
  return (
    (westMinutes > 0 ? "-" : "+") +
    String(Math.trunc(absolute / 60)).padStart(2, "0") +
    ":" +
    String(absolute % 60).padStart(2, "0")
  );
}

export function localTimeOffsets(
  wall: string,
  offsetAt = (instant: number) => new Date(instant).getTimezoneOffset(),
) {
  const normalized = wallWithSeconds(wall);
  const time = Date.parse(normalized + "Z");
  if (
    !normalized ||
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 19) !== normalized
  )
    return [];
  // Try the offsets on both sides of a local clock change, then verify each instant.
  const hour = 3_600_000;
  const candidates = new Set([-36, -12, 0, 12, 36].map((n) => offsetAt(time + n * hour)));
  return [...candidates]
    .filter((offset) => offsetAt(time + offset * 60_000) === offset)
    .map(formatOffset);
}

export function enteredInstant(wall: string, offset: string) {
  return wallWithSeconds(wall) && offset ? wallWithSeconds(wall) + offset : "";
}
