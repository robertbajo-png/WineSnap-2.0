import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, Shield, Info } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/me")({
  head: () => ({ meta: [{ title: "Profil — Winesnap" }] }),
  component: MePage,
});

function MePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ display_name: string | null } | null>(null);
  const [count, setCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data));
    supabase
      .from("wines")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => setCount(count ?? 0));
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  if (!loading && !user) {
    return (
      <AppShell>
        <div className="mt-20 text-center">
          <p className="text-muted-foreground">Logga in för att se din profil.</p>
          <Link to="/login">
            <Button className="mt-4 bg-gradient-gold text-background">Logga in</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <AppShell>
      <h1 className="font-display text-3xl">Profil</h1>

      <Card className="mt-5 p-5 text-center shadow-soft">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-gold text-background font-display text-2xl text-primary-foreground shadow-elegant">
          {(profile?.display_name ?? user?.email ?? "?").charAt(0).toUpperCase()}
        </div>
        <p className="mt-3 font-display text-xl">{profile?.display_name ?? "—"}</p>
        <p className="text-xs text-muted-foreground">{user?.email}</p>
        <p className="mt-3 text-sm">
          <span className="font-display text-2xl text-gold">{count}</span>{" "}
          <span className="text-muted-foreground">vin sparade</span>
        </p>
      </Card>

      <div className="mt-6 space-y-2">
        {isAdmin && (
          <Link to="/admin">
            <Card className="flex items-center gap-3 p-4 hover:bg-accent">
              <Shield className="h-5 w-5 text-gold" />
              <span>Admin</span>
            </Card>
          </Link>
        )}
        <Link to="/about">
          <Card className="flex items-center gap-3 p-4 hover:bg-accent">
            <Info className="h-5 w-5 text-gold" />
            <span>Om Winesnap</span>
          </Card>
        </Link>
      </div>

      <Button variant="ghost" onClick={signOut} className="mt-6 w-full text-destructive hover:text-destructive">
        <LogOut className="h-4 w-4" /> Logga ut
      </Button>
    </AppShell>
  );
}
