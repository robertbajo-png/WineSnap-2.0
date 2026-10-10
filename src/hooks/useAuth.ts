import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let authEvent = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!active) return;
      authEvent = true;
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active || authEvent) return;
        setSession(data.session);
        setUser(data.session?.user ?? null);
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
