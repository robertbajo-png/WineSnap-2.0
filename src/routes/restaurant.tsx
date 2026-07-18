import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Type, Loader2, Sparkles, Wine, RefreshCw } from "lucide-react";
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

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

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
      setPicks(data?.picks ?? []);
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
        <div className="w-10" />
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">{t("restaurant.subtitle")}</p>

      {/* Mode toggle */}
      <div className="mt-5 flex rounded-full border border-white/10 bg-card/50 p-1">
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
    </div>
  );
}
