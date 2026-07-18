import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, Wine, RefreshCw, Loader2, Bookmark } from "lucide-react";
import { addToWishlist } from "@/lib/wishlist";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/i18n";

export const Route = createFileRoute("/for-you")({
  head: () => ({
    meta: [
      { title: "Suggestions — WineSnap" },
      { name: "description", content: "AI-generated wine suggestions based on your taste and cellar." },
    ],
  }),
  component: ForYouPage,
});

type Suggestion = {
  producer: string;
  wine_name: string;
  vintage?: string;
  region: string;
  country: string;
  wine_type: string;
  grape_varieties?: string[];
  price_range?: string;
  match_score: number;
  reason: string;
};

const CACHE_KEY = "winesnap:suggestions:v1";

function ForYouPage() {
  const { user, loading } = useAuth();
  const t = useT();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSuggestions(parsed.suggestions ?? []);
        setGeneratedAt(parsed.generatedAt ?? null);
      }
    } catch { /* noop */ }
  }, []);

  const generate = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const [{ data: profile }, { data: taste }, { data: cellar }] = await Promise.all([
        supabase.from("profiles").select("preferred_types,preferred_regions,preferred_grapes,body,sweetness,oak,tannin,acidity,price_min,price_max").eq("id", user.id).maybeSingle(),
        supabase.from("taste_profile").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("wines").select("producer,wine_name,vintage,region,country,user_rating").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
      ]);

      const { data, error: fnError } = await supabase.functions.invoke("taste-suggestions", {
        body: { profile, taste, cellar },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      const list: Suggestion[] = data?.suggestions ?? [];
      setSuggestions(list);
      const ts = Date.now();
      setGeneratedAt(ts);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ suggestions: list, generatedAt: ts }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  if (!loading && !user) {
    return (
      <AppShell>
        <div className="mt-20 text-center">
          <p className="text-muted-foreground">{t("foryou.signIn")}</p>
          <Link to="/login"><Button className="mt-4 bg-gradient-burgundy text-cream">{t("login.signIn")}</Button></Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-gold" />
              <h1 className="font-display text-3xl text-cream">{t("foryou.title")}</h1>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {generatedAt
                ? `${t("foryou.updated")} ${new Date(generatedAt).toLocaleString()}`
                : t("foryou.subtitle")}
            </p>
          </div>
          <button
            onClick={generate}
            disabled={busy}
            className="mt-1 flex h-9 items-center gap-1.5 rounded-full border border-gold/40 bg-background/60 px-3 text-xs text-gold disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {suggestions.length ? t("foryou.refresh") : t("foryou.generate")}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
            <Button variant="ghost" size="sm" onClick={generate} className="ml-2 h-6 text-xs">{t("common.retry")}</Button>
          </div>
        )}

        {!suggestions.length && !busy ? (
          <EmptyState
            icon={Wine}
            title={t("foryou.title")}
            description={t("foryou.emptyDesc")}
            action={
              <Button onClick={generate} className="bg-gradient-burgundy text-cream">
                <Sparkles className="h-4 w-4" /> {t("foryou.generateBtn")}
              </Button>
            }
          />
        ) : busy && !suggestions.length ? (
          <div className="mt-12 flex flex-col items-center text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-gold" />
            <p className="mt-3 text-sm">{t("foryou.working")}</p>
          </div>
        ) : (
          <div className="mt-6 space-y-3 pb-4">
            {suggestions.map((s, i) => (
              <article key={i} className="rounded-xl border border-white/8 bg-card/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base leading-tight text-cream">
                      {s.producer} — {s.wine_name} {s.vintage ?? ""}
                    </p>
                    <p className="mt-0.5 text-xs text-gold">
                      {[s.region, s.country].filter(Boolean).join(", ")}
                      {s.wine_type ? ` • ${s.wine_type}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 text-[11px] font-medium text-success">
                    {Math.round(s.match_score)}%
                  </span>
                </div>
                {s.grape_varieties?.length ? (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{s.grape_varieties.join(", ")}{s.price_range ? ` • ${s.price_range}` : ""}</p>
                ) : s.price_range ? (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{s.price_range}</p>
                ) : null}
                <p className="mt-2 text-xs leading-relaxed text-foreground/80">{s.reason}</p>
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={() => addToWishlist({
                      producer: s.producer, wine_name: s.wine_name, vintage: s.vintage,
                      region: s.region, country: s.country, wine_type: s.wine_type,
                      grape_varieties: s.grape_varieties, source: "ai", ai_data: s as never,
                    })}
                    className="flex items-center gap-1 rounded-md border border-gold/30 bg-background/40 px-2 py-1 text-[11px] text-gold hover:bg-background/70"
                  >
                    <Bookmark className="h-3 w-3" /> {t("wishlist.saveBtn")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
