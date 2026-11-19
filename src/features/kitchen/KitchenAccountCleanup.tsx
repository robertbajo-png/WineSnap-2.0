import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { clearKitchenCache } from "./storage";
import { kitchenEnabled } from "./feature";

export function KitchenAccountCleanup() {
  useEffect(() => {
    if (!kitchenEnabled) return;
    let previous: string | null = null;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const next = session?.user.id ?? null;
      if (event === "SIGNED_OUT" || (previous && next !== previous))
        void clearKitchenCache(next ?? undefined).catch(() => {
          // Fail closed on the next cache read; no private records are put into logs.
          window.dispatchEvent(new Event("kitchen-storage-error"));
        });
      previous = next;
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return null;
}
