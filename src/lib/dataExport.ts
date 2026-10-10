import { readAllPages } from "./readAllPages";
export const EXPORT_TABLES = [
  "ai_conversations",
  "ai_messages",
  "analytics_events",
  "collector_lots",
  "derived_preferences",
  "recommendation_events",
  "restaurant_scans",
  "taste_profile",
  "taste_signals",
  "tasting_notes",
  "wine_photos",
  "wines",
  "wishlist",
  "user_roles",
] as const;
export async function collectOwnData(
  ownerId: string,
  read: (
    table: (typeof EXPORT_TABLES)[number] | "profiles",
    owner: string,
    from: number,
    to: number,
  ) => PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>,
  stillOwner: () => boolean,
) {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of ["profiles", ...EXPORT_TABLES] as const) {
    if (!stillOwner()) throw new Error("Account changed");
    const rows = await readAllPages(
      (from, to) => read(table, ownerId, from, to),
      () => !stillOwner(),
    );
    if (!stillOwner()) throw new Error("Account changed");
    if (rows.some((row) => (table === "profiles" ? row.id : row.user_id) !== ownerId))
      throw new Error("Invalid export owner");
    tables[table] = rows;
  }
  return {
    format: "WineSnap user export v1",
    exported_at: new Date().toISOString(),
    tables,
    excluded: [
      "image file contents",
      "social relationship graphs",
      "server-only quota records",
      "provider logs",
      "backups",
    ],
  };
}
