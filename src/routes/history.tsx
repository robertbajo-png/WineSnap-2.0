import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Wine } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "Historik — Winesnap" }] }),
  component: HistoryPage,
});

type W = {
  id: string;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  image_url: string | null;
  wine_type: string | null;
  region: string | null;
};

const TYPES = [
  { v: "all", l: "Alla" },
  { v: "red", l: "Rött" },
  { v: "white", l: "Vitt" },
  { v: "rose", l: "Rosé" },
  { v: "sparkling", l: "Mousserande" },
] as const;

function HistoryPage() {
  const { user, loading } = useAuth();
  const [wines, setWines] = useState<W[]>([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("all");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("wines")
      .select("id,producer,wine_name,vintage,image_url,wine_type,region")
      .order("created_at", { ascending: false })
      .then(({ data }) => setWines((data as W[]) ?? []));
  }, [user]);

  if (!loading && !user) {
    return (
      <AppShell>
        <div className="mt-20 text-center">
          <p className="text-muted-foreground">Logga in för att se din historik.</p>
          <Link to="/login">
            <Button className="mt-4 bg-gradient-wine">Logga in</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const filtered = wines.filter((w) => {
    if (type !== "all" && w.wine_type !== type) return false;
    if (q && !`${w.producer} ${w.wine_name} ${w.region}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <AppShell>
      <h1 className="font-display text-3xl">Din historik</h1>
      <p className="mt-1 text-sm text-muted-foreground">{wines.length} vin sparade</p>

      <Input
        placeholder="Sök producent, namn, region…"
        className="mt-5"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {TYPES.map((t) => (
          <button
            key={t.v}
            onClick={() => setType(t.v)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              type === t.v
                ? "border-burgundy bg-burgundy text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {t.l}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-2.5">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {wines.length === 0 ? "Skanna ditt första vin på startsidan." : "Inga vin matchar."}
          </p>
        ) : (
          filtered.map((w) => (
            <Link key={w.id} to="/wine/$id" params={{ id: w.id }}>
              <Card className="flex items-center gap-3 p-3 shadow-soft hover:shadow-elegant">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-champagne">
                  {w.image_url ? (
                    <img src={w.image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Wine className="h-6 w-6 text-burgundy" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base">{w.wine_name ?? "Okänt vin"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[w.producer, w.vintage, w.region].filter(Boolean).join(" • ")}
                  </p>
                </div>
              </Card>
            </Link>
          ))
        )}
      </div>
    </AppShell>
  );
}
