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
  const [stats, setStats] = useState<{
    users: number;
    wines: number;
    public_wines: number;
    wishlist_items: number;
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.rpc("get_admin_stats").then(({ data, error }) => {
      if (error || !data || Array.isArray(data) || typeof data !== "object") {
        setAllowed(false);
        return;
      }
      const result = data as Record<string, unknown>;
      setStats({
        users: Number(result.users ?? 0),
        wines: Number(result.wines ?? 0),
        public_wines: Number(result.public_wines ?? 0),
        wishlist_items: Number(result.wishlist_items ?? 0),
      });
      setAllowed(true);
    });
  }, [user]);

  if (loading || allowed === null) {
    return (
      <AppShell>
        <p className="mt-20 text-center text-muted-foreground">Laddar…</p>
      </AppShell>
    );
  }
  if (!allowed) {
    return (
      <AppShell>
        <div className="mt-20 text-center">
          <p className="text-muted-foreground">Du har inte adminbehörighet.</p>
          <Link to="/me">
            <Button className="mt-4">Tillbaka</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link
        to="/me"
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Tillbaka
      </Link>
      <h1 className="font-display text-3xl">Admin</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Användare", stats?.users],
          ["Viner", stats?.wines],
          ["Delade viner", stats?.public_wines],
          ["Önskelistan", stats?.wishlist_items],
        ].map(([label, value]) => (
          <Card key={String(label)} className="p-5">
            <p className="text-xs uppercase text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-3xl text-gold">{value ?? "—"}</p>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Roller hanteras direkt i databasen via tabellen{" "}
        <code className="rounded bg-muted px-1 py-0.5">user_roles</code>.
      </p>
    </AppShell>
  );
}
