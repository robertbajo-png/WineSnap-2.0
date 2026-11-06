import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ownedDeviceOrigin, requestOwnedDeviceSession } from "@/lib/ownedDeviceLogin";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let authEvent = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!active) return;
      if (_e === "INITIAL_SESSION" && !s && ownedDeviceOrigin()) return;
      authEvent = true;
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active || authEvent) return;
        let current = data.session;
        if (!current && ownedDeviceOrigin()) {
          const approved = await requestOwnedDeviceSession();
          if (!active || authEvent) return;
          if (approved) {
            const saved = await supabase.auth.setSession({
              access_token: approved.access_token,
              refresh_token: approved.refresh_token,
            });
            current = saved.error ? null : saved.data.session;
          }
        }
        if (!active || authEvent) return;
        setSession(current);
        setUser(current?.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (active && !authEvent) setLoading(false);
      });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user, loading };
}
