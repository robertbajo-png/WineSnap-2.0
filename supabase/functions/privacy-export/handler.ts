import { privacyCors, privacyJson, type StorageObject } from "../_shared/privacy.ts";
import type { PrivacyDependencies } from "../_shared/privacyDependencies.ts";

const ownedTables = [
  "profiles",
  "ai_conversations",
  "ai_messages",
  "analytics_events",
  "collector_lots",
  "kitchen_week_plans",
  "kitchen_pantry",
  "kitchen_pantry_consumption",
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
];
const photoBucket = "meal-photos";
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;

export function createHandler(dependencies: PrivacyDependencies) {
  const { env, admin: privacyAdmin, erase: runAccountErasure } = dependencies;
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: privacyCors });
    if (req.method !== "POST") return privacyJson({ error: "Method not allowed" }, 405);
    try {
      const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
      if (!token) return privacyJson({ error: "Unauthorized" }, 401);
      const admin = privacyAdmin();
      const { data: auth, error } = await admin.auth.getUser(token);
      if (error || !auth.user) return privacyJson({ error: "Unauthorized" }, 401);
      const owner = auth.user.id;
      const { data: quota, error: quotaError } = await admin.rpc("consume_ai_quota", {
        _user_id: owner,
        _function_name: "privacy-export",
        _limit: 2,
        _window_seconds: 300,
      });
      if (quotaError) return privacyJson({ error: "Export unavailable" }, 503);
      if (!quota?.[0]?.allowed) return privacyJson({ error: "Try again later" }, 429);
      const { data: active, error: activeError } = await admin.rpc("privacy_account_active", {
        _user_id: owner,
      });
      if (activeError || active !== true) return privacyJson({ error: "Account unavailable" }, 403);
      const tables: Record<string, Record<string, unknown>[]> = {};
      let total = 0;
      let totalBytes = 0;
      const photoExport = env("OWNED_MEAL_PHOTO_EXPORT") === "true";
      const cookingTables =
        env("KITCHEN_CORE_ENABLED") === "true"
          ? ["kitchen_recipes", "kitchen_recipe_versions", "cooking_sessions", "cooking_feedback"]
          : [];
      for (const table of [
        ...ownedTables,
        ...cookingTables,
        ...(photoExport ? ["kitchen_photo_meals"] : []),
        ...(env("AI_CHEF_ENABLED") === "true"
          ? [
              "food_memory_state",
              "food_signals",
              "food_memory_tombstones",
              "chef_conversations",
              "chef_messages",
              "chef_requests",
            ]
          : []),
        "follows",
        ...(env("MEALS_ENABLED") === "true"
          ? [
              "kitchen_households",
              "kitchen_household_members",
              "kitchen_household_invites",
              "kitchen_diners",
              "meal_wine_links",
            ]
          : []),
        "user_taste_similarity",
        "ai_rate_limits",
      ]) {
        const rows: Record<string, unknown>[] = [];
        for (let from = 0; ; from += 500) {
          let query = admin.from(table).select("*");
          if (table === "follows")
            query = query.or(`follower_id.eq.${owner},following_id.eq.${owner}`);
          else if (table === "user_taste_similarity")
            query = query.or(`user_id.eq.${owner},peer_user_id.eq.${owner}`);
          else query = query.eq(table === "profiles" ? "id" : "user_id", owner);
          if (table === "taste_profile" || table === "kitchen_pantry")
            query = query.order("user_id");
          else if (table === "kitchen_week_plans") query = query.order("week_start");
          else if (table === "kitchen_pantry_consumption") query = query.order("session_id");
          else if (table === "user_taste_similarity")
            query = query.order("user_id").order("peer_user_id");
          else if (table === "ai_rate_limits")
            query = query.order("function_name").order("window_started_at");
          else query = query.order("id");
          const { data, error } = await query.range(from, from + 499);
          if (error || !Array.isArray(data)) throw new Error("export_error");
          totalBytes += new TextEncoder().encode(JSON.stringify(data)).length;
          if (totalBytes > 20 * 1024 * 1024)
            return privacyJson({ error: "export_requires_support" }, 413);
          rows.push(...data);
          total += data.length;
          if (total > 20_000) return privacyJson({ error: "export_requires_support" }, 413);
          if (data.length < 500) break;
        }
        tables[table] = rows;
      }
      const { data: objects, error: storageError } = await admin.rpc(
        "privacy_account_storage_objects",
        { _user_id: owner, _limit: 501 },
      );
      if (storageError || !Array.isArray(objects)) throw new Error("export_error");
      if (objects.length > 500) return privacyJson({ error: "export_requires_support" }, 413);
      const files = [];
      const buckets = new Map<string, string[]>();
      const photoObjects = new Set<string>();
      for (const object of objects as StorageObject[]) {
        // Food photos never enter the Storage signed-URL path, even when disabled.
        if (object.bucket_id === photoBucket) {
          photoObjects.add(object.name);
          continue;
        }
        const paths = buckets.get(object.bucket_id) ?? [];
        paths.push(object.name);
        buckets.set(object.bucket_id, paths);
      }
      if (!photoExport && photoObjects.size)
        return privacyJson({ error: "Meal photo export unavailable" }, 503);
      for (const record of tables.kitchen_photo_meals ?? []) {
        if (record.photo_state !== "ready") continue;
        const id = record.id;
        if (record.user_id !== owner || typeof id !== "string" || !uuid.test(id))
          throw new Error("export_error");
        const path = `${owner}/${id}.png`;
        if (!photoObjects.has(path)) throw new Error("export_error");
        files.push({ bucket: photoBucket, path, mealId: id });
      }
      for (const [bucket, paths] of buckets) {
        const { data, error } = await admin.storage.from(bucket).createSignedUrls(paths, 900);
        if (error || !data || data.length !== paths.length) throw new Error("export_error");
        for (const file of data) {
          if (file.error || !file.signedUrl || !file.path) throw new Error("export_error");
          files.push({ bucket, path: file.path, signedUrl: file.signedUrl });
        }
      }
      const { data: stillActive } = await admin.rpc("privacy_account_active", { _user_id: owner });
      if (stillActive !== true) return privacyJson({ error: "Account unavailable" }, 403);
      return privacyJson({
        format: "WineSnap user export v2",
        exported_at: new Date().toISOString(),
        account: {
          id: owner,
          email: auth.user.email,
          created_at: auth.user.created_at,
          metadata: auth.user.user_metadata,
        },
        tables,
        files,
        excluded: [
          "provider logs and backups: available personal data handled through an access request",
        ],
      });
    } catch {
      console.error("privacy-export failed");
      return privacyJson(
        { error: "Could not export data; contact the operator for an access request" },
        500,
      );
    }
  };
}
