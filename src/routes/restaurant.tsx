import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  Camera,
  History,
  Loader2,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Type,
  Utensils,
  Wine,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { RecommendationMatch } from "@/components/RecommendationMatch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useI18n, useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { MatchEvidence } from "@/lib/recommendationEngine";
import { askErrorKey } from "@/lib/askWineSnap";
import {
  recommendationKey,
  recordRecommendationEvent,
  type RecommendationEventType,
} from "@/lib/recommendationEvents";
import type {
  BudgetFit,
  DishFit,
  RestaurantCandidate,
  RestaurantMode,
} from "@/lib/restaurantRanking";
import { addToWishlist } from "@/lib/wishlist";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/restaurant")({
  head: () => ({
    meta: [
      { title: "Restaurant Mode — WineSnap" },
      {
        name: "description",
        content: "Scan a restaurant wine list and rank its wines for your taste, food, and budget.",
      },
    ],
  }),
  component: RestaurantPage,
});

type Pick = RestaurantCandidate & {
  match_score: number;
  match_confidence: "low" | "medium" | "high";
  match_evidence: MatchEvidence[];
  budget_fit: BudgetFit;
  selection_style: RestaurantMode;
  reason?: string | null;
};

type ScanConstraints = {
  source: "text" | "camera";
  dish: string;
  maxPrice: number | null;
  mode: RestaurantMode;
};

type HistoryRow = {
  id: string;
  restaurant_name: string | null;
  created_at: string;
  matches: Pick[];
  menu_text: string | null;
  constraints: ScanConstraints | null;
};

type FeedbackState = Record<string, "like" | "dislike">;

async function prepareMenuImage(file: File) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("unsupported");
  if (file.size > 12 * 1024 * 1024) throw new Error("large");

  const bitmap = await createImageBitmap(file);
  const maxDimension = 1800;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("unsupported");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.84);
  if (dataUrl.length > 8 * 1024 * 1024) throw new Error("large");
  return dataUrl;
}

function parseConstraints(value: unknown): ScanConstraints | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const mode: RestaurantMode =
    input.mode === "familiar" || input.mode === "adventurous" ? input.mode : "balanced";
  return {
    source: input.source === "camera" ? "camera" : "text",
    dish: typeof input.dish === "string" ? input.dish : "",
    maxPrice: typeof input.maxPrice === "number" ? input.maxPrice : null,
    mode,
  };
}

function RestaurantPage() {
  const { user, loading } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const t = useT();
  const cameraRef = useRef<HTMLInputElement>(null);
  const [inputMode, setInputMode] = useState<"text" | "camera">("text");
  const [recommendationMode, setRecommendationMode] = useState<RestaurantMode>("balanced");
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [dish, setDish] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState>({});
  const [coldStart, setColdStart] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const loadHistory = async () => {
    if (!user) return;
    const { data, error: historyError } = await supabase
      .from("restaurant_scans")
      .select("id,restaurant_name,created_at,matches,menu_text,constraints")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (historyError) {
      console.error("Could not load restaurant history", historyError);
      return;
    }
    setHistory(
      (data ?? []).map((row) => ({
        ...row,
        matches: Array.isArray(row.matches) ? (row.matches as unknown as Pick[]) : [],
        constraints: parseConstraints(row.constraints),
      })),
    );
  };

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const onImage = async (file: File) => {
    try {
      setError(null);
      setImage(await prepareMenuImage(file));
      setPicks([]);
    } catch (imageError) {
      setImage(null);
      toast.error(
        imageError instanceof Error && imageError.message === "large"
          ? t("restaurant.imageLarge")
          : t("restaurant.imageUnsupported"),
      );
    } finally {
      if (cameraRef.current) cameraRef.current.value = "";
    }
  };

  const currentConstraints = (): ScanConstraints => ({
    source: inputMode,
    dish: dish.trim(),
    maxPrice: Number(maxPrice) > 0 ? Number(maxPrice) : null,
    mode: recommendationMode,
  });

  const generate = async () => {
    if (!user) return;
    if (inputMode === "text" && text.trim().length < 3) {
      toast.error(t("restaurant.needText"));
      return;
    }
    if (inputMode === "camera" && !image) {
      toast.error(t("restaurant.needImage"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const constraints = currentConstraints();
      const { data, error: functionError } = await supabase.functions.invoke("restaurant-match", {
        body: {
          text: inputMode === "text" ? text : undefined,
          image: inputMode === "camera" ? image : undefined,
          constraints,
          language: lang,
        },
      });
      if (functionError) throw functionError;
      if (data?.error) throw new Error(data.error);
      const nextPicks: Pick[] = Array.isArray(data?.picks) ? data.picks : [];
      if (!nextPicks.length) throw new Error(t("restaurant.noWines"));

      setPicks(nextPicks);
      setFeedback({});
      setColdStart(Boolean(data?.cold_start));
      const { error: saveError } = await supabase.from("restaurant_scans").insert({
        user_id: user.id,
        restaurant_name: restaurantName.trim() || null,
        image_url: null,
        menu_text: inputMode === "text" ? text : null,
        matches: nextPicks as unknown as Json,
        constraints: constraints as unknown as Json,
        extracted_wines: (data?.extracted_wines ?? []) as Json,
        language: lang,
      });
      if (saveError) {
        console.error("Could not save restaurant scan", saveError);
        toast.error(t("restaurant.historySaveError"));
      }
      void loadHistory();
    } catch (generateError) {
      const key = askErrorKey(generateError);
      setError(t(key === "ask.error.generic" ? "restaurant.error.generic" : key));
    } finally {
      setBusy(false);
    }
  };

  const sendFeedback = async (pick: Pick, eventType: RecommendationEventType) => {
    if (eventType !== "like" && eventType !== "dislike") return;
    const key = recommendationKey(pick);
    if (!key || feedback[key] === eventType) return;
    const saved = await recordRecommendationEvent(eventType, "restaurant", pick, {
      restaurant_name: restaurantName.trim() || null,
      constraints: currentConstraints(),
      match_score: pick.match_score,
    });
    if (!saved) {
      toast.error(t("recommendation.feedbackError"));
      return;
    }
    setFeedback((current) => ({ ...current, [key]: eventType }));
    toast.success(t("recommendation.feedbackSaved"));
  };

  const savePick = async (pick: Pick) => {
    const saved = await addToWishlist({
      producer: pick.producer,
      wine_name: pick.wine_name,
      vintage: pick.vintage,
      region: pick.region,
      country: pick.country,
      wine_type: pick.wine_type,
      grape_varieties: pick.grape_varieties,
      description: pick.reason,
      source: "restaurant",
      ai_data: pick as unknown as Record<string, unknown>,
    });
    if (saved) {
      await recordRecommendationEvent("save", "restaurant", pick, {
        restaurant_name: restaurantName.trim() || null,
        constraints: currentConstraints(),
        menu_price: pick.price_amount ?? pick.price ?? null,
      });
    }
  };

  const reopenHistory = (row: HistoryRow) => {
    setShowHistory(false);
    setPicks(row.matches);
    setFeedback({});
    setRestaurantName(row.restaurant_name ?? "");
    const constraints = row.constraints;
    setDish(constraints?.dish ?? "");
    setMaxPrice(constraints?.maxPrice ? String(constraints.maxPrice) : "");
    setRecommendationMode(constraints?.mode ?? "balanced");
    setInputMode(constraints?.source ?? (row.menu_text ? "text" : "camera"));
    setText(row.menu_text ?? "");
    setImage(null);
  };

  return (
    <div className="min-h-screen bg-background px-5 pb-24 pt-6">
      <header className="flex items-center justify-between">
        <button
          onClick={() => navigate({ to: "/" })}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10"
          aria-label={t("common.back")}
        >
          <ArrowLeft className="h-5 w-5 text-cream" />
        </button>
        <div className="text-center">
          <h1 className="font-display text-2xl text-gold">{t("restaurant.title")}</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t("restaurant.subtitle")}</p>
        </div>
        <button
          onClick={() => setShowHistory((current) => !current)}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full border",
            showHistory ? "border-gold/50 bg-gold/10 text-gold" : "border-white/10 text-cream",
          )}
          aria-label={t("restaurant.history")}
        >
          <History className="h-5 w-5" />
        </button>
      </header>

      {showHistory ? (
        <HistorySection
          history={history}
          onDelete={async (id) => {
            const { error: deleteError } = await supabase
              .from("restaurant_scans")
              .delete()
              .eq("id", id);
            if (deleteError) {
              toast.error(t("common.error"));
              return;
            }
            void loadHistory();
          }}
          onReopen={reopenHistory}
        />
      ) : (
        <main>
          <section className="mt-5 border-y border-white/8 py-4">
            <label className="block text-[11px] uppercase text-muted-foreground">
              {t("restaurant.name")}
              <input
                value={restaurantName}
                onChange={(event) => setRestaurantName(event.target.value)}
                placeholder={t("restaurant.namePh")}
                className="mt-1.5 w-full rounded-md border border-white/10 bg-card/50 px-3 py-2.5 text-sm normal-case text-cream placeholder:text-muted-foreground focus:border-gold/40 focus:outline-none"
              />
            </label>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block text-[11px] uppercase text-muted-foreground">
                {t("restaurant.dish")}
                <div className="relative mt-1.5">
                  <Utensils className="absolute left-3 top-2.5 h-4 w-4 text-gold" />
                  <input
                    value={dish}
                    onChange={(event) => setDish(event.target.value)}
                    placeholder={t("restaurant.dishPh")}
                    className="w-full rounded-md border border-white/10 bg-card/50 py-2.5 pl-9 pr-3 text-sm normal-case text-cream placeholder:text-muted-foreground focus:border-gold/40 focus:outline-none"
                  />
                </div>
              </label>
              <label className="block text-[11px] uppercase text-muted-foreground">
                {t("restaurant.maxPrice")}
                <input
                  type="number"
                  min="1"
                  inputMode="decimal"
                  value={maxPrice}
                  onChange={(event) => setMaxPrice(event.target.value)}
                  placeholder={t("restaurant.maxPricePh")}
                  className="mt-1.5 w-full rounded-md border border-white/10 bg-card/50 px-3 py-2.5 text-sm normal-case text-cream placeholder:text-muted-foreground focus:border-gold/40 focus:outline-none"
                />
              </label>
            </div>

            <fieldset className="mt-4">
              <legend className="text-[11px] uppercase text-muted-foreground">
                {t("restaurant.style")}
              </legend>
              <div className="mt-1.5 grid grid-cols-3 rounded-md border border-white/10 bg-card/40 p-1">
                {(["familiar", "balanced", "adventurous"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setRecommendationMode(mode)}
                    className={cn(
                      "min-h-9 rounded px-2 text-xs transition-colors",
                      recommendationMode === mode
                        ? "bg-burgundy text-cream"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    aria-pressed={recommendationMode === mode}
                  >
                    {t(`restaurant.mode.${mode}`)}
                  </button>
                ))}
              </div>
            </fieldset>
          </section>

          <div className="mt-4 grid grid-cols-2 rounded-md border border-white/10 bg-card/40 p-1">
            <button
              type="button"
              onClick={() => setInputMode("text")}
              className={cn(
                "flex min-h-10 items-center justify-center gap-2 rounded text-sm",
                inputMode === "text" ? "bg-burgundy text-cream" : "text-muted-foreground",
              )}
              aria-pressed={inputMode === "text"}
            >
              <Type className="h-4 w-4" /> {t("restaurant.type")}
            </button>
            <button
              type="button"
              onClick={() => setInputMode("camera")}
              className={cn(
                "flex min-h-10 items-center justify-center gap-2 rounded text-sm",
                inputMode === "camera" ? "bg-burgundy text-cream" : "text-muted-foreground",
              )}
              aria-pressed={inputMode === "camera"}
            >
              <Camera className="h-4 w-4" /> {t("restaurant.snap")}
            </button>
          </div>

          {inputMode === "text" ? (
            <div className="mt-4">
              <Textarea
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setPicks([]);
                }}
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
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onImage(file);
                }}
              />
              {image ? (
                <div className="relative overflow-hidden rounded-md border border-white/10">
                  <img
                    src={image}
                    alt={t("restaurant.menuPreview")}
                    className="max-h-[320px] w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setImage(null)}
                    className="absolute right-2 top-2 rounded-md bg-background/90 px-3 py-1.5 text-xs text-cream"
                  >
                    {t("common.clear")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="flex h-[180px] w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-white/15 bg-card/30 text-muted-foreground"
                >
                  <Camera className="h-8 w-8 text-gold" />
                  <span className="mt-2 text-sm">{t("restaurant.snapCta")}</span>
                </button>
              )}
            </div>
          )}

          <Button
            onClick={generate}
            disabled={busy}
            className="mt-5 h-12 w-full rounded-md bg-gradient-burgundy font-display text-cream shadow-elegant"
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("restaurant.working")}
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {picks.length ? t("restaurant.rerank") : t("restaurant.findBest")}
              </>
            )}
          </Button>

          {error && (
            <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {coldStart && picks.length > 0 && (
            <div className="mt-4 border-l-2 border-gold/50 bg-gold/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {t("recommendation.coldStart")}
            </div>
          )}

          {picks.length > 0 ? (
            <Results
              picks={picks}
              feedback={feedback}
              onRefresh={generate}
              onFeedback={sendFeedback}
              onSave={savePick}
              busy={busy}
            />
          ) : (
            !busy &&
            !error && (
              <div className="mt-8">
                <EmptyState
                  icon={Wine}
                  title={t("restaurant.emptyTitle")}
                  description={t("restaurant.emptyDesc")}
                />
              </div>
            )
          )}
        </main>
      )}
    </div>
  );
}

function Results({
  picks,
  feedback,
  onRefresh,
  onFeedback,
  onSave,
  busy,
}: {
  picks: Pick[];
  feedback: FeedbackState;
  onRefresh: () => void;
  onFeedback: (pick: Pick, event: RecommendationEventType) => void;
  onSave: (pick: Pick) => void;
  busy: boolean;
}) {
  const t = useT();
  return (
    <section className="mt-7">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-cream">{t("restaurant.picks")}</h2>
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center gap-1 text-xs text-gold"
          disabled={busy}
        >
          <RefreshCw className="h-3.5 w-3.5" /> {t("foryou.refresh")}
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {picks.map((pick, index) => {
          const key = recommendationKey(pick) || String(index);
          const selectedFeedback = feedback[key];
          return (
            <article key={key} className="rounded-md border border-white/10 bg-card/50 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-semibold text-gold">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display leading-tight text-cream">
                    {[pick.producer, pick.wine_name].filter(Boolean).join(" — ")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[pick.vintage, pick.region, pick.country].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {pick.price && <span className="shrink-0 text-sm text-gold">{pick.price}</span>}
              </div>

              <div className="mt-3 border-y border-white/8 py-3">
                <RecommendationMatch
                  score={pick.match_score}
                  confidence={pick.match_confidence ?? "low"}
                  evidence={pick.match_evidence ?? []}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {pick.budget_fit && (
                  <StatusBadge
                    tone={pick.budget_fit === "over_budget" ? "warn" : "neutral"}
                    label={t(`restaurant.budget.${pick.budget_fit}`)}
                  />
                )}
                {pick.dish_fit && (
                  <StatusBadge
                    tone={pick.dish_fit === "poor" ? "warn" : "positive"}
                    label={t(`restaurant.dishFit.${pick.dish_fit}`)}
                  />
                )}
                {pick.selection_style && (
                  <StatusBadge
                    tone="neutral"
                    label={t(`restaurant.mode.${pick.selection_style}`)}
                  />
                )}
              </div>

              {pick.reason && (
                <p className="mt-3 text-sm leading-relaxed text-foreground/80">{pick.reason}</p>
              )}
              {pick.grape_varieties?.length ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {pick.grape_varieties.join(", ")}
                </p>
              ) : null}

              <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onFeedback(pick, "like")}
                    aria-label={t("recommendation.like")}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md border",
                      selectedFeedback === "like"
                        ? "border-success/40 bg-success/15 text-success"
                        : "border-white/10 text-muted-foreground",
                    )}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onFeedback(pick, "dislike")}
                    aria-label={t("recommendation.notForMe")}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md border",
                      selectedFeedback === "dislike"
                        ? "border-destructive/40 bg-destructive/15 text-destructive"
                        : "border-white/10 text-muted-foreground",
                    )}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onSave(pick)}
                  className="flex h-8 items-center gap-1.5 rounded-md border border-gold/30 px-2.5 text-[11px] text-gold"
                >
                  <Bookmark className="h-3.5 w-3.5" /> {t("wishlist.saveBtn")}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "positive" | "warn" | "neutral" }) {
  return (
    <span
      className={cn(
        "rounded-md border px-2 py-1 text-[10px] uppercase",
        tone === "positive" && "border-success/25 bg-success/8 text-foreground/80",
        tone === "warn" && "border-destructive/25 bg-destructive/8 text-foreground/75",
        tone === "neutral" && "border-white/10 text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function HistorySection({
  history,
  onDelete,
  onReopen,
}: {
  history: HistoryRow[];
  onDelete: (id: string) => void;
  onReopen: (row: HistoryRow) => void;
}) {
  const t = useT();
  if (!history.length) {
    return <EmptyState icon={History} title={t("restaurant.historyEmpty")} />;
  }

  return (
    <section className="mt-6 space-y-3">
      <h2 className="text-[11px] uppercase text-muted-foreground">{t("restaurant.history")}</h2>
      {history.map((row) => {
        const top = row.matches[0];
        return (
          <article key={row.id} className="rounded-md border border-white/10 bg-card/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => onReopen(row)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate font-display text-cream">
                  {row.restaurant_name ||
                    (row.constraints?.source === "camera"
                      ? t("restaurant.photoMenu")
                      : t("restaurant.textMenu"))}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {new Date(row.created_at).toLocaleString()} · {row.matches.length}{" "}
                  {t("restaurant.historyPicks")}
                </p>
                {top && (
                  <p className="mt-2 truncate text-xs text-foreground/80">
                    <span className="text-gold">{Math.round(top.match_score)}%</span>{" "}
                    {top.wine_name}
                  </p>
                )}
              </button>
              <button
                type="button"
                onClick={() => onDelete(row.id)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-destructive"
                aria-label={t("restaurant.deleteHistory")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
