import { supabase } from "@/integrations/supabase/client";

export type PrivacyAction = "reset_memory" | "delete_account";
export const privacyControlsEnabled = import.meta.env.VITE_PRIVACY_CONTROLS_ENABLED === "true";

export async function invokePrivacyAction(action: PrivacyAction, owner: string) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (sessionError || !token) throw new Error("Account changed");
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || auth.user?.id !== owner) throw new Error("Account changed");
  const { data, error } = await supabase.functions.invoke("privacy-controls", {
    // Bind confirmation to this account even if another tab switches sessions.
    headers: { Authorization: `Bearer ${token}` },
    body: { action, confirm: action },
  });
  if (error) {
    if (error.context instanceof Response) {
      const detail = await error.context
        .clone()
        .json()
        .catch(() => null);
      if (detail?.error === "reauthentication_required")
        throw new Error("reauthentication_required");
    }
    throw new Error("Privacy request failed");
  }
  if (typeof data?.complete !== "boolean") throw new Error("Invalid privacy response");
  return data as { complete: boolean; queued?: boolean };
}
