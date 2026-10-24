import type { SupabaseClient } from "@supabase/supabase-js";
import { eraseAccountFiles, type StorageObject } from "./privacy.ts";

export async function runAccountErasure(admin: SupabaseClient, userId: string) {
  const { data: claimed, error: attemptError } = await admin.rpc("claim_account_erasure", {
    _user_id: userId,
  });
  if (attemptError) throw new Error("worker_error");
  if (claimed !== true) return { complete: false };
  try {
    return await eraseAccountFiles(userId, {
      list: async (owner) => {
        const { data, error } = await admin.rpc("privacy_account_storage_objects", {
          _user_id: owner,
          _limit: 200,
        });
        if (error || !Array.isArray(data)) throw new Error("storage_error");
        return data as StorageObject[];
      },
      remove: async (bucket, names) => {
        const { error } = await admin.storage.from(bucket).remove(names);
        if (error) throw new Error("storage_error");
      },
      deleteAuth: async (owner) => {
        // Legacy photo rows do not have a user FK; remove them explicitly.
        const { error: photoError } = await admin.from("wine_photos").delete().eq("user_id", owner);
        if (photoError) throw new Error("worker_error");
        const { error } = await admin.auth.admin.deleteUser(owner);
        if (error) throw new Error("auth_error");
        const { error: receiptError } = await admin
          .from("privacy_erasure_receipts")
          .update({ completed_at: new Date().toISOString() })
          .eq("user_id", owner);
        if (receiptError) throw new Error("worker_error");
      },
    });
  } catch (error) {
    const code =
      error instanceof Error && ["storage_error", "auth_error"].includes(error.message)
        ? error.message
        : "worker_error";
    await admin
      .from("account_erasure_jobs")
      .update({ last_error_code: code })
      .eq("user_id", userId);
    throw new Error(code);
  }
}
