import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Loader2, RefreshCw, Sparkles, ThumbsDown, ThumbsUp, Wine } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { RecommendationMatch } from "@/components/RecommendationMatch";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useI18n, useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import type { MatchEvidence, RecommendationCandidate } from "@/lib/recommendationEngine";
import {
  recommendationKey,
  recordRecommendationEvent,
  type RecommendationEventType,
} from "@/lib/recommendationEvents";
import { addToWishlist } from "@/lib/wishlist";
import { cn } from "@/lib/utils";
import { askErrorKey } from "@/lib/askWineSnap";

export const Route = createFileRoute("/for-you")({
  head: () => ({
    meta: [
      { title: "Suggestions — WineSnap" },
      {
        name: "description",
        content: "Wine recommendations ranked from your taste profile and Wine Memory.",
      },
    ],
  }),
  component: ForYouPage,
});

type Suggestion = RecommendationCandidate & {
  producer: string;
  wine_name: string;
  region: string;
  country: string;
  wine_type: string;
  grape_varieties?: string[];
  price_range?: string;
  match_score: number;
  match_confidence: "low" | "medium" | "high";
  match_evidence: MatchEvidence[];
  reason: string;
};

type FeedbackState = Record<string, "like" | "dislike">;

function ForYouPage() {
  const { user, loading } = useAuth();
  const { lang } = useI18n();
  const t = useT();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState>({});
  const savingKeys = useRef(new Set<string>());
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [coldStart, setColdStart] = useState(false);
  const cacheKey = useMemo(() => (user ? `winesnap:suggestions:v3:${user.id}` : null), [user]);

  useEffect(() => {
    setSuggestions([]);
    setSavedKeys(new Set());
    setGeneratedAt(null);
    setColdStart(false);
    if (!cacheKey) return;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSuggestions(parsed.suggestions ?? []);
        setGeneratedAt(parsed.generatedAt ?? null);
        setColdStart(Boolean(parsed.coldStart));
      }
    } catch {
      localStorage.removeItem(cacheKey);
    }
  }, [cacheKey]);

  const generate = async () => {
    if (!user || !cacheKey) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: functionError } = await supabase.functions.invoke("taste-suggestions", {
        body: { language: lang },
      });
      if (functionError) throw functionError;
      if (data?.error) throw new Error(data.error);

      const list: Suggestion[] = data?.suggestions ?? [];
      const isColdStart = Boolean(data?.cold_start);
      const timestamp = Date.now();
      setSuggestions(list);
      setFeedback({});
      setGeneratedAt(timestamp);
      setColdStart(isColdStart);
      localStorage.setItem(
        cacheKey,
        JSON.stringify({ suggestions: list, generatedAt: timestamp, coldStart: isColdStart }),
      );
    } catch (generateError) {
      const key = askErrorKey(generateError);
      setError(t(key === "ask.error.generic" ? "common.error" : key));
    } finally {
      setBusy(false);
    }
  };

  const sendFeedback = async (suggestion: Suggestion, eventType: RecommendationEventType) => {
    const key = recommendationKey(suggestion);
    if (!key || (eventType !== "like" && eventType !== "dislike")) return;
    if (feedback[key] === eventType) return;
    const saved = await recordRecommendationEvent(eventType, "for_you", suggestion, {
      match_score: suggestion.match_score,
      confidence: suggestion.match_confidence,
    });
    if (!saved) {
      toast.error(t("recommendation.feedbackError"));
      return;
    }
    setFeedback((current) => ({ ...current, [key]: eventType }));
    toast.success(t("recommendation.feedbackSaved"));
  };

  const saveSuggestion = async (suggestion: Suggestion) => {
    const key = recommendationKey(suggestion);
    if (savingKeys.current.has(key) || savedKeys.has(key)) return;
    savingKeys.current.add(key);
    try {
      const saved = await addToWishlist({
        producer: suggestion.producer,
        wine_name: suggestion.wine_name,
        vintage: suggestion.vintage,
        region: suggestion.region,
        country: suggestion.country,
        wine_type: suggestion.wine_type,
        grape_varieties: suggestion.grape_varieties,
        source: "ai",
        ai_data: suggestion as never,
      });
      if (saved) {
        setSavedKeys((current) => new Set([...current, key]));
        await recordRecommendationEvent("save", "for_you", suggestion, {
          match_score: suggestion.match_score,
        });
      }
    } finally {
      savingKeys.current.delete(key);
    }
  };

  if (!loading && !user) {
    return (
      <AppShell>
        <div className="mt-20 text-center">
          <p className="text-muted-foreground">{t("foryou.signIn")}</p>
          <Link to="/login">
            <Button className="mt-4 bg-gradient-burgundy text-cream min-h-11">
              {t("login.signIn")}
            </Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <button
            onClick={generate}
            disabled={busy}
            className="order-2 flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-gold/40 bg-background/60 px-3 text-sm text-gold disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <RefreshCw className="h-5 w-5" />
            )}
            {suggestions.length ? t("foryou.refresh") : t("foryou.generate")}
          </button>
          <div className="min-w-0 flex-1 basis-40">
            <h1 className="font-display text-2xl text-gold">{t("foryou.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {generatedAt
                ? `${t("foryou.updated")} ${new Date(generatedAt).toLocaleString()}`
                : t("foryou.subtitle")}
            </p>
          </div>
        </header>

        {coldStart && suggestions.length > 0 && (
          <div className="mt-4 border-l-2 border-gold/50 bg-gold/5 px-3 py-2 text-sm leading-relaxed text-muted-foreground">
            {t("recommendation.coldStart")}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
            <Button
              variant="ghost"
              size="sm"
              onClick={generate}
              className="ml-2 min-h-11 text-sm min-h-11"
            >
              {t("common.retry")}
            </Button>
          </div>
        )}

        {!suggestions.length && !busy ? (
          <EmptyState
            icon={Wine}
            title={t("foryou.title")}
            description={t("foryou.emptyDesc")}
            action={
              <Button onClick={generate} className="bg-gradient-burgundy text-cream min-h-11">
                <Sparkles className="h-5 w-5" /> {t("foryou.generateBtn")}
              </Button>
            }
          />
        ) : busy && !suggestions.length ? (
          <div className="mt-12 flex flex-col items-center text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-gold" />
            <p className="mt-3 text-base">{t("foryou.working")}</p>
          </div>
        ) : (
          <div className="mt-6 space-y-3 pb-4">
            {suggestions.map((suggestion) => {
              const key = recommendationKey(suggestion);
              const selectedFeedback = feedback[key];
              return (
                <article key={key} className="rounded-md border border-white/8 bg-card/50 p-4">
                  <div className="min-w-0">
                    <p className="font-display text-base leading-tight text-cream">
                      {suggestion.producer} — {suggestion.wine_name} {suggestion.vintage ?? ""}
                    </p>
                    <p className="mt-0.5 text-sm text-gold">
                      {[suggestion.region, suggestion.country].filter(Boolean).join(", ")}
                      {suggestion.wine_type ? ` • ${suggestion.wine_type}` : ""}
                    </p>
                  </div>

                  <div className="mt-3 border-y border-white/8 py-3">
                    <RecommendationMatch
                      score={suggestion.match_score}
                      confidence={suggestion.match_confidence}
                      evidence={suggestion.match_evidence ?? []}
                    />
                  </div>

                  {suggestion.grape_varieties?.length || suggestion.price_range ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {suggestion.grape_varieties?.join(", ")}
                      {suggestion.grape_varieties?.length && suggestion.price_range ? " • " : ""}
                      {suggestion.price_range}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm leading-relaxed text-foreground/80">
                    {suggestion.reason}
                  </p>

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/8 pt-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => sendFeedback(suggestion, "like")}
                        aria-label={t("recommendation.like")}
                        title={t("recommendation.like")}
                        className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-md border transition-colors min-h-11 min-w-11",
                          selectedFeedback === "like"
                            ? "border-success/40 bg-success/15 text-success"
                            : "border-white/10 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <ThumbsUp className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => sendFeedback(suggestion, "dislike")}
                        aria-label={t("recommendation.notForMe")}
                        title={t("recommendation.notForMe")}
                        className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-md border transition-colors min-h-11 min-w-11",
                          selectedFeedback === "dislike"
                            ? "border-destructive/40 bg-destructive/15 text-destructive"
                            : "border-white/10 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <ThumbsDown className="h-5 w-5" />
                      </button>
                    </div>
                    <button
                      onClick={() => saveSuggestion(suggestion)}
                      disabled={savedKeys.has(key)}
                      className="flex h-11 items-center gap-1.5 rounded-md border border-gold/30 bg-background/40 px-2.5 text-sm text-gold hover:bg-background/70 min-h-11 min-w-11"
                    >
                      <Bookmark className="h-5 w-5" />{" "}
                      {t(savedKeys.has(key) ? "common.saved" : "wishlist.saveBtn")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
