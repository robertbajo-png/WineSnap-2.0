import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Winesnap" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [stats, setStats] = useState<{ wines: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => setAllowed(!!data));
  }, [user]);

  useEffect(() => {
    if (!allowed) return;
    supabase
      .from("wines")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => setStats({ wines: count ?? 0 }));
  }, [allowed]);

  if (loading || allowed === null) {
    return <AppShell><p className="mt-20 text-center text-muted-foreground">Laddar…</p></AppShell>;
  }
  if (!allowed) {
    return (
      <AppShell>
        <div className="mt-20 text-center">
          <p className="text-muted-foreground">Du har inte adminbehörighet.</p>
          <Link to="/me"><Button className="mt-4">Tillbaka</Button></Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link to="/me" className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Tillbaka
      </Link>
      <h1 className="font-display text-3xl">Admin</h1>

      <Card className="mt-6 p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Totalt antal vin</p>
        <p className="mt-1 font-display text-4xl text-burgundy">{stats?.wines ?? "—"}</p>
      </Card>

      <p className="mt-6 text-sm text-muted-foreground">
        Roller hanteras direkt i databasen via tabellen <code className="rounded bg-muted px-1 py-0.5">user_roles</code>.
      </p>
    </AppShell>
  );
}
