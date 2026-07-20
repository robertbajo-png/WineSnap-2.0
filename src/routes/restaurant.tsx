import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Type, Loader2, Sparkles, Wine, RefreshCw, History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/restaurant")({
  head: () => ({
    meta: [
      { title: "Restaurant Mode — WineSnap" },
      { name: "description", content: "Snap a wine list or paste it in — get sommelier picks tuned to your taste." },
    ],
  }),
  component: RestaurantPage,
});

type Pick = {
  producer?: string;
  wine_name: string;
  vintage?: string;
  region?: string;
  country?: string;
  wine_type?: string;
  grape_varieties?: string[];
  price?: string;
  match_score: number;
  reason: string;
  confidence?: string;
};

function RestaurantPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const cameraRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"text" | "camera">("text");
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [restaurantName, setRestaurantName] = useState("");
  type HistoryRow = {
    id: string;
    restaurant_name: string | null;
    created_at: string;
    matches: Pick[];
    menu_text: string | null;
    image_url: string | null;
  };
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const loadHistory = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("restaurant_scans")
      .select("id,restaurant_name,created_at,matches,menu_text,image_url")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setHistory((data as HistoryRow[] | null) ?? []);
  };

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const onImage = async (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const generate = async () => {
    if (!user) return;
    if (mode === "text" && text.trim().length < 3) {
      toast.error(t("restaurant.needText"));
      return;
    }
    if (mode === "camera" && !image) {
      toast.error(t("restaurant.needImage"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const [{ data: profile }, { data: taste }] = await Promise.all([
        supabase.from("profiles").select("preferred_types,preferred_regions,preferred_grapes,body,sweetness,oak,tannin,acidity,price_min,price_max").eq("id", user.id).maybeSingle(),
        supabase.from("taste_profile").select("*").eq("user_id", user.id).maybeSingle(),
      ]);
      const { data, error: fnError } = await supabase.functions.invoke("restaurant-match", {
        body: {
          text: mode === "text" ? text : undefined,
          image: mode === "camera" ? image : undefined,
          profile,
          taste,
        },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      const nextPicks: Pick[] = data?.picks ?? [];
      setPicks(nextPicks);
      // Save to history
      if (nextPicks.length > 0) {
        await supabase.from("restaurant_scans").insert({
          user_id: user.id,
          restaurant_name: restaurantName.trim() || null,
          image_url: mode === "camera" ? image : null,
          menu_text: mode === "text" ? text : null,
          matches: nextPicks as unknown as import("@/integrations/supabase/types").Json,
        });
        loadHistory();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const scoreColor = (s: number) =>
    s >= 85 ? "text-emerald-400" : s >= 70 ? "text-gold" : "text-foreground/70";
  const confidenceLabel = (c?: string) =>
    c === "safe" ? t("restaurant.safe") : c === "stretch" ? t("restaurant.stretch") : t("restaurant.balanced");

  return (
    <div className="min-h-screen bg-background px-5 pt-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate({ to: "/" })} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10">
          <ArrowLeft className="h-5 w-5 text-cream" />
        </button>
        <h1 className="font-display text-lg text-cream">{t("restaurant.title")}</h1>
        <button
          onClick={() => setShowHistory((v) => !v)}
          className={`flex h-10 w-10 items-center justify-center rounded-full border ${showHistory ? "border-gold/50 bg-gold/10 text-gold" : "border-white/10 text-cream"}`}
          aria-label="History"
        >
          <History className="h-5 w-5" />
        </button>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">{t("restaurant.subtitle")}</p>

      {showHistory ? (
        <HistorySection
          history={history}
          onDelete={async (id) => {
            await supabase.from("restaurant_scans").delete().eq("id", id);
            loadHistory();
          }}
          onReopen={(row) => {
            setShowHistory(false);
            setPicks(row.matches ?? []);
            setRestaurantName(row.restaurant_name ?? "");
            if (row.menu_text) { setMode("text"); setText(row.menu_text); setImage(null); }
            else if (row.image_url) { setMode("camera"); setImage(row.image_url); setText(""); }
          }}
        />
      ) : (
      <>
      {/* Restaurant name */}
      <input
        value={restaurantName}
        onChange={(e) => setRestaurantName(e.target.value)}
        placeholder="Restaurant name (optional)"
        className="mt-4 w-full rounded-xl border border-white/10 bg-card/50 px-3 py-2 text-sm text-cream placeholder:text-muted-foreground focus:border-gold/40 focus:outline-none"
      />

      {/* Mode toggle */}
      <div className="mt-3 flex rounded-full border border-white/10 bg-card/50 p-1">
        <button
          onClick={() => setMode("text")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2 text-sm ${mode === "text" ? "bg-gradient-burgundy text-cream" : "text-muted-foreground"}`}
        >
          <Type className="h-4 w-4" /> {t("restaurant.type")}
        </button>
        <button
          onClick={() => setMode("camera")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2 text-sm ${mode === "camera" ? "bg-gradient-burgundy text-cream" : "text-muted-foreground"}`}
        >
          <Camera className="h-4 w-4" /> {t("restaurant.snap")}
        </button>
      </div>


      {/* Input */}
      {mode === "text" ? (
        <div className="mt-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("restaurant.textPh")}
            className="min-h-[180px] resize-none border-white/10 bg-card/50 text-sm"
          />
          <p className="mt-2 text-[11px] text-muted-foreground">{t("restaurant.textHint")}</p>
        </div>
      ) : (
        <div className="mt-4">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onImage(e.target.files[0])}
          />
          {image ? (
            <div className="relative overflow-hidden rounded-2xl border border-white/10">
              <img src={image} alt="Wine menu" className="w-full max-h-[300px] object-cover" />
              <button
                onClick={() => setImage(null)}
                className="absolute right-2 top-2 rounded-full bg-background/80 px-3 py-1 text-xs text-cream"
              >
                {t("common.clear")}
              </button>
            </div>
          ) : (
            <button
              onClick={() => cameraRef.current?.click()}
              className="flex h-[180px] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/15 bg-card/30 text-muted-foreground"
            >
              <Camera className="h-8 w-8 text-gold" />
              <p className="mt-2 text-sm">{t("restaurant.snapCta")}</p>
            </button>
          )}
        </div>
      )}

      {/* Generate button */}
      <Button
        onClick={generate}
        disabled={busy}
        className="mt-5 h-12 w-full rounded-2xl bg-gradient-burgundy font-display text-cream shadow-elegant"
      >
        {busy ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("restaurant.working")}</>
        ) : (
          <><Sparkles className="mr-2 h-4 w-4" /> {picks.length ? t("restaurant.rerank") : t("restaurant.findBest")}</>
        )}
      </Button>

      {error && <p className="mt-3 text-center text-sm text-destructive">{error}</p>}

      {/* Results */}
      {picks.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-cream">{t("restaurant.picks")}</h2>
            <button onClick={generate} className="flex items-center gap-1 text-xs text-gold" disabled={busy}>
              <RefreshCw className="h-3 w-3" /> {t("foryou.refresh")}
            </button>
          </div>
          {picks.map((p, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-card/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold/20 text-[11px] font-semibold text-gold">
                      {i + 1}
                    </span>
                    <p className="truncate font-display text-cream">{p.wine_name}</p>
                  </div>
                  {p.producer && <p className="mt-1 text-xs text-muted-foreground">{p.producer}</p>}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {[p.vintage, p.region, p.country].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`font-display text-lg ${scoreColor(p.match_score)}`}>{Math.round(p.match_score)}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{confidenceLabel(p.confidence)}</span>
                  {p.price && <span className="text-[11px] text-gold">{p.price}</span>}
                </div>
              </div>
              <p className="mt-3 border-t border-white/5 pt-3 text-sm leading-relaxed text-foreground/80">{p.reason}</p>
              {p.grape_varieties && p.grape_varieties.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.grape_varieties.map((g) => (
                    <span key={g} className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">{g}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!busy && picks.length === 0 && !error && (
        <div className="mt-8">
          <EmptyState
            icon={Wine}
            title={t("restaurant.emptyTitle")}
            description={t("restaurant.emptyDesc")}
          />
        </div>
      )}
      </>
      )}
    </div>
  );
}

function HistorySection({
  history,
  onDelete,
  onReopen,
}: {
  history: Array<{
    id: string;
    restaurant_name: string | null;
    created_at: string;
    matches: Pick[];
    menu_text: string | null;
    image_url: string | null;
  }>;
  onDelete: (id: string) => void;
  onReopen: (row: {
    id: string;
    restaurant_name: string | null;
    matches: Pick[];
    menu_text: string | null;
    image_url: string | null;
  }) => void;
}) {
  if (history.length === 0) {
    return (
      <div className="mt-10 text-center text-sm text-muted-foreground">
        No saved restaurant scans yet.
      </div>
    );
  }
  return (
    <div className="mt-4 space-y-3">
      {history.map((h) => {
        const top = h.matches?.[0];
        return (
          <div key={h.id} className="rounded-2xl border border-white/10 bg-card/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <button onClick={() => onReopen(h)} className="min-w-0 flex-1 text-left">
                <p className="truncate font-display text-cream">
                  {h.restaurant_name || (h.menu_text ? "Text menu" : "Photo menu")}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {new Date(h.created_at).toLocaleString()} · {h.matches?.length ?? 0} picks
                </p>
                {top && (
                  <p className="mt-2 text-xs text-foreground/80">
                    <span className="text-gold">#{Math.round(top.match_score)}</span> {top.wine_name}
                  </p>
                )}
              </button>
              <button
                onClick={() => onDelete(h.id)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-destructive"
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
