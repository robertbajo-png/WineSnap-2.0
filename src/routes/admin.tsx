import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/i18n";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Winesnap" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { user, loading } = useAuth();
  const t = useT();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [stats, setStats] = useState<{ wines: number } | null>(null);

  useEffect(() => {
    let active = true;
    setAllowed(null);
    setCheckFailed(false);
    setStats(null);
    if (!user) {
      if (!loading) setAllowed(false);
      return;
    }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        setCheckFailed(!!error);
        setAllowed(!error && !!data);
      });
    return () => {
      active = false;
    };
  }, [user, loading, retry]);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    supabase
      .from("wines")
      .select("id", { count: "exact", head: true })
      .then(({ count, error }) => {
        if (active && !error) setStats({ wines: count ?? 0 });
      });
    return () => {
      active = false;
    };
  }, [allowed, user]);

  if (loading || allowed === null) {
    return (
      <AppShell>
        <p role="status" className="mt-20 text-center text-muted-foreground">
          {t("common.loading")}
        </p>
      </AppShell>
    );
  }
  if (checkFailed) {
    return (
      <AppShell>
        <div className="mt-20 text-center">
          <p role="alert" className="text-muted-foreground">
            {t("admin.checkFailed")}
          </p>
          <Button className="mt-4 min-h-11" onClick={() => setRetry((value) => value + 1)}>
            {t("common.retry")}
          </Button>
        </div>
      </AppShell>
    );
  }
  if (!allowed) {
    return (
      <AppShell>
        <div className="mt-20 text-center">
          <p className="text-muted-foreground">Du har inte adminbehörighet.</p>
          <Link to="/me">
            <Button className="mt-4 min-h-11">Tillbaka</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link
        to="/me"
        className="mb-4 flex items-center gap-1 text-base text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-5 w-5" /> Tillbaka
      </Link>
      <h1 className="font-display text-3xl">Admin</h1>

      <Card className="mt-6 p-5">
        <p className="text-sm uppercase tracking-wider text-muted-foreground">
          {t("admin.visibleWines")}
        </p>
        <p className="mt-1 font-display text-4xl text-gold">{stats?.wines ?? "—"}</p>
      </Card>

      <p className="mt-6 text-base text-muted-foreground">
        Roller hanteras direkt i databasen via tabellen{" "}
        <code className="rounded bg-muted px-1 py-0.5">user_roles</code>.
      </p>
    </AppShell>
  );
}
