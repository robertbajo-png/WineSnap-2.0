import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget analytics event. Silently swallows errors so telemetry
 * never breaks the user's flow.
 */
export async function logEvent(name: string, properties: Record<string, unknown> = {}) {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return;
    await supabase.from("analytics_events").insert({
      user_id: user.id,
      event_name: name,
      properties: properties as never,
    });
  } catch (e) {
    if (import.meta.env.DEV) console.warn("analytics", name, e);
  }
}
