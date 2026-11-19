import { privacyCors, privacyJson, type StorageObject } from "../_shared/privacy.ts";
import type { PrivacyDependencies } from "../_shared/privacyDependencies.ts";

export function createHandler(dependencies: PrivacyDependencies) {
  const { env, admin: privacyAdmin, erase: runAccountErasure } = dependencies;
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: privacyCors });
    if (req.method !== "POST") return privacyJson({ error: "Method not allowed" }, 405);
    const secret = env("PRIVACY_CRON_SECRET");
    if (!secret || secret.length < 32)
      return privacyJson({ error: "Maintenance not configured" }, 503);
    if (req.headers.get("authorization") !== `Bearer ${secret}`)
      return privacyJson({ error: "Unauthorized" }, 401);
    try {
      const body = await req.json();
      const execute = body.execute === true;
      if (execute && env("PRIVACY_MAINTENANCE_ENABLED") !== "true")
        return privacyJson({ error: "Maintenance deployment not verified" }, 503);
      const admin = privacyAdmin();
      const { data: retention, error } = await admin.rpc("run_privacy_retention", {
        _execute: execute,
      });
      if (error) throw new Error("retention_error");
      let chefRetention: { moreWork?: boolean } | null = null;
      let mealsRetention: { moreWork?: boolean } | null = null;
      if (env("MEALS_ENABLED") === "true") {
        const meals = await admin.rpc("run_meals_retention", { _execute: execute });
        if (meals.error) throw new Error("meals_retention_error");
        mealsRetention = meals.data;
      }
      if (env("AI_CHEF_ENABLED") === "true") {
        const chef = await admin.rpc("run_chef_retention", { _execute: execute });
        if (chef.error) throw new Error("chef_retention_error");
        chefRetention = chef.data;
      }
      const { data: orphans, error: orphanError } = await admin.rpc("privacy_orphan_images", {
        _limit: 100,
      });
      if (orphanError || !Array.isArray(orphans)) throw new Error("storage_error");
      let completed = 0;
      let failures = 0;
      let queueAtLimit = false;
      if (execute) {
        for (const object of orphans as StorageObject[]) {
          const { error } = await admin.storage.from(object.bucket_id).remove([object.name]);
          if (error) failures++;
        }
        if (env("PRIVACY_DELETION_ENABLED") === "true") {
          const { data: jobs, error } = await admin
            .from("account_erasure_jobs")
            .select("user_id")
            .order("requested_at")
            .limit(10);
          if (error) throw new Error("queue_error");
          queueAtLimit = (jobs?.length ?? 0) >= 10;
          for (const job of jobs ?? []) {
            try {
              if ((await runAccountErasure(admin, job.user_id)).complete) completed++;
            } catch {
              failures++;
            }
          }
        }
      }
      console.info("privacy-maintenance", { execute, completed, failures });
      return privacyJson(
        {
          retention,
          ...(chefRetention ? { chef_retention: chefRetention } : {}),
          ...(mealsRetention ? { meals_retention: mealsRetention } : {}),
          orphan_candidates: orphans.length,
          completed,
          failures,
          more_work:
            retention?.more_batches_required === true ||
            chefRetention?.moreWork === true ||
            mealsRetention?.moreWork === true ||
            orphans.length >= 100 ||
            queueAtLimit,
        },
        failures ? 500 : 200,
      );
    } catch {
      console.error("privacy-maintenance failed");
      return privacyJson({ error: "Maintenance failed" }, 500);
    }
  };
}
