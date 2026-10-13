import { privacyCors, privacyJson, recentSignIn } from "../_shared/privacy.ts";
import { privacyAdmin, runAccountErasure } from "../_shared/privacyRuntime.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: privacyCors });
  if (req.method !== "POST") return privacyJson({ error: "Method not allowed" }, 405);
  try {
    const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return privacyJson({ error: "Unauthorized" }, 401);
    const admin = privacyAdmin();
    const { data: auth, error } = await admin.auth.getUser(token);
    if (error || !auth.user) return privacyJson({ error: "Unauthorized" }, 401);
    const { action, confirm } = await req.json();
    if (action !== "delete_account" && action !== "reset_memory")
      return privacyJson({ error: "Invalid action" }, 400);
    if (confirm !== action) return privacyJson({ error: "Confirmation required" }, 400);
    if (!recentSignIn(auth.user.last_sign_in_at))
      return privacyJson({ error: "reauthentication_required" }, 403);
    if (action === "reset_memory") {
      const { error } = await admin.rpc("reset_privacy_memory", { _user_id: auth.user.id });
      if (error) throw new Error("reset_error");
      return privacyJson({ complete: true });
    }
    if (
      Deno.env.get("PRIVACY_DELETION_ENABLED") !== "true" ||
      Deno.env.get("PRIVACY_MAINTENANCE_ENABLED") !== "true" ||
      (Deno.env.get("PRIVACY_CRON_SECRET")?.length ?? 0) < 32
    )
      return privacyJson({ error: "Erasure deployment not verified" }, 503);
    const { error: requestError } = await admin.rpc("request_account_erasure", {
      _user_id: auth.user.id,
    });
    if (requestError) throw new Error("request_error");
    try {
      const result = await runAccountErasure(admin, auth.user.id);
      return privacyJson(result, result.complete ? 200 : 202);
    } catch {
      // The durable request remains queued and blocks further account writes.
      return privacyJson({ complete: false, queued: true }, 202);
    }
  } catch {
    console.error("privacy-controls failed");
    return privacyJson({ error: "Could not process privacy request" }, 500);
  }
});
