import { privacyCors, privacyJson, type StorageObject } from "../_shared/privacy.ts";
import { privacyAdmin, runAccountErasure } from "../_shared/privacyRuntime.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: privacyCors });
  if (req.method !== "POST") return privacyJson({ error: "Method not allowed" }, 405);
  const secret = Deno.env.get("PRIVACY_CRON_SECRET");
  if (!secret || secret.length < 32)
    return privacyJson({ error: "Maintenance not configured" }, 503);
  if (req.headers.get("authorization") !== `Bearer ${secret}`)
    return privacyJson({ error: "Unauthorized" }, 401);
  try {
    const body = await req.json();
    const execute = body.execute === true;
    if (execute && Deno.env.get("PRIVACY_MAINTENANCE_ENABLED") !== "true")
      return privacyJson({ error: "Maintenance deployment not verified" }, 503);
    const admin = privacyAdmin();
    const { data: retention, error } = await admin.rpc("run_privacy_retention", {
      _execute: execute,
    });
    if (error) throw new Error("retention_error");
    const { data: orphans, error: orphanError } = await admin.rpc("privacy_orphan_images", {
      _limit: 100,
    });
    if (orphanError || !Array.isArray(orphans)) throw new Error("storage_error");
    let completed = 0;
    let failures = 0;
    if (execute) {
      for (const object of orphans as StorageObject[]) {
        const { error } = await admin.storage.from(object.bucket_id).remove([object.name]);
        if (error) failures++;
      }
      if (Deno.env.get("PRIVACY_DELETION_ENABLED") === "true") {
        const { data: jobs, error } = await admin
          .from("account_erasure_jobs")
          .select("user_id")
          .order("requested_at")
          .limit(10);
        if (error) throw new Error("queue_error");
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
      { retention, orphan_candidates: orphans.length, completed, failures },
      failures ? 500 : 200,
    );
  } catch {
    console.error("privacy-maintenance failed");
    return privacyJson({ error: "Maintenance failed" }, 500);
  }
});
