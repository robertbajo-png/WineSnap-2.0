import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Wine,
  Trash2,
  Star,
  Sparkles,
  Loader2,
  Plus,
  Share2,
  Pencil,
  Clock,
  MessageCircleMore,
  Scale,
  Bookmark,
  ThumbsDown,
  ThumbsUp,
  MoreHorizontal,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WineDetailSkeleton } from "@/components/Skeleton";
import { AromaProfileTabs } from "@/components/AromaProfileTabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useT, useI18n } from "@/i18n";
import type { TKey } from "@/i18n";
import { computeDrinkingWindow } from "@/lib/drinkingWindow";
import { PhotoGallery } from "@/components/PhotoGallery";
import { WineImage } from "@/components/WineImage";
import { normalizeIntensities } from "@/lib/tastingNotes";
import { RecommendationMatch } from "@/components/RecommendationMatch";
import type { MatchEvidence, RecommendationCandidate } from "@/lib/recommendationEngine";
import { recommendationKey, recordRecommendationEvent } from "@/lib/recommendationEvents";
import { addToWishlist } from "@/lib/wishlist";
import { wineRating, type RatedWine } from "@/lib/wineRatings";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/wine/$id")({
  head: () => ({ meta: [{ title: "Wine — WineSnap" }] }),
  component: WineRoute,
});

type Pair = { dish: string; reason: string };
type WineRow = RatedWine & {
  id: string;
  image_url: string | null;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  grape_varieties: string[] | null;
  region: string | null;
  country: string | null;
  wine_type: string | null;
  description: string | null;
  fruit: number | null;
  tannin: number | null;
  acidity: number | null;
  oak: number | null;
  sweetness: number | null;
  body: number | null;
  primary_notes: string[] | null;
  secondary_notes: string[] | null;
  tertiary_notes: string[] | null;
  food_pairings: Pair[] | null;
  serving_temp: string | null;
  glass_type: string | null;
  decant: boolean | null;
};

const TABS = ["Overview", "Aromas", "Tasting", "Food", "AI Picks"] as const;

const TAB_KEYS = ["overview", "aromas", "tasting", "food", "ai"] as const;
type Tab = (typeof TAB_KEYS)[number];

type Suggestion = RecommendationCandidate & {
  identity_verified: boolean;
  source_url: string;
  producer: string;
  wine_name: string;
  region: string;
  country: string;
  grape_varieties?: string[];
  price_range?: string;
  match_score: number;
  match_confidence: "low" | "medium" | "high";
  match_evidence: MatchEvidence[];
  reason: string;
};

type TastingNote = {
  id: string;
  rating: number | null;
  notes: string | null;
  aromas: string[] | null;
  finish: string | null;
  location: string | null;
  tasted_at: string;
  aroma_intensities?: unknown;
};

function WineRoute() {
  const isDetail = useRouterState({
    select: (state) => state.matches[state.matches.length - 1]?.routeId === "/wine/$id",
  });
  return isDetail ? <WineDetailPage /> : <Outlet />;
}

function WineDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const t = useT();
  const { lang } = useI18n();
  const [w, setW] = useState<WineRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("aromas");
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestFeedback, setSuggestFeedback] = useState<Record<string, "like" | "dislike">>({});
  const [notes, setNotes] = useState<TastingNote[]>([]);
  const { user, loading: authLoading } = useAuth();
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);

  const loadSuggestions = async () => {
    if (!w || suggestLoading) return;
    setSuggestLoading(true);
    setSuggestError(null);
    try {
      const { data, error } = await supabase.functions.invoke("wine-suggestions", {
        body: { wineId: w.id, language: lang },
      });
      if (error) throw error;
      const payload = data as { error?: string; suggestions?: Suggestion[] } | null;
      if (payload?.error) throw new Error(payload.error);
      setSuggestions(
        (payload?.suggestions ?? []).filter(
          (suggestion) => suggestion.identity_verified && suggestion.source_url,
        ),
      );
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : "Failed to load suggestions");
    } finally {
      setSuggestLoading(false);
    }
  };

  const sendSuggestionFeedback = async (suggestion: Suggestion, event: "like" | "dislike") => {
    if (suggestFeedback[recommendationKey(suggestion)] === event) return;
    const saved = await recordRecommendationEvent(event, "similar", suggestion, {
      reference_wine_id: w?.id,
      match_score: suggestion.match_score,
    });
    if (!saved) {
      toast.error(t("recommendation.feedbackError"));
      return;
    }
    setSuggestFeedback((current) => ({
      ...current,
      [recommendationKey(suggestion)]: event,
    }));
    toast.success(t("recommendation.feedbackSaved"));
  };

  const saveSuggestion = async (suggestion: Suggestion) => {
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
      await recordRecommendationEvent("save", "similar", suggestion, {
        reference_wine_id: w?.id,
        match_score: suggestion.match_score,
      });
    }
  };

  useEffect(() => {
    if (tab === "ai" && !suggestions && !suggestLoading && w) loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, w]);

  useEffect(() => {
    let cancelled = false;
    setW(null);
    setNotes([]);
    setLoading(true);
    setLoadError(false);
    setSuggestions(null);
    if (authLoading) return;
    supabase
      .from("wines")
      .select("*,tasting_notes(rating,created_at,user_id)")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoadError(Boolean(error));
        setW(data as WineRow | null);
        setLoading(false);
      });
    supabase
      .from("tasting_notes")
      .select("*")
      .eq("wine_id", id)
      .order("tasted_at", { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (!cancelled) {
          setNotes((data as TastingNote[]) ?? []);
          if (error) toast.error(t("common.error"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, user?.id, authLoading, revision, t]);

  const remove = async () => {
    if (!confirm(t("wine.deleteConfirm"))) return;
    const { error } = await supabase.from("wines").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("wine.removed"));
    navigate({ to: "/cellar" });
  };

  if (loading || authLoading)
    return (
      <AppShell>
        <WineDetailSkeleton />
      </AppShell>
    );
  if (loadError)
    return (
      <AppShell>
        <p role="alert">{t("common.error")}</p>
        <Button variant="outline" onClick={() => setRevision((n) => n + 1)}>
          {t("common.retry")}
        </Button>
      </AppShell>
    );
  if (!w)
    return (
      <AppShell>
        <div className="mt-20 text-center">
          <p className="text-muted-foreground">{t("wine.notFound")}</p>
          <Link to="/cellar">
            <Button className="mt-4 min-h-11">{t("wine.backToCellar")}</Button>
          </Link>
        </div>
      </AppShell>
    );

  const rating = wineRating(w);
  const aromas = [
    ...(w.primary_notes ?? []),
    ...(w.secondary_notes ?? []),
    ...(w.tertiary_notes ?? []),
  ].slice(0, 6);

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          <button
            onClick={() => window.history.back()}
            aria-label="Back"
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/5 min-h-11 min-w-11"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-1">
            <Link
              to="/ask"
              search={{ wineId: w.id, source: "wine" }}
              aria-label={t("ask.title")}
              title={t("ask.title")}
              className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/5"
            >
              <MessageCircleMore className="h-5 w-5" />
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("common.more")}
                  title={t("common.more")}
                >
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuItem asChild>
                  <Link
                    to="/compare"
                    search={{ left: w.id }}
                    aria-label={t("compare.title")}
                    title={t("compare.title")}
                    className="flex min-h-11 w-full items-center gap-3 text-base"
                  >
                    <Scale className="h-5 w-5" />
                    {t("compare.title")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <button
                    onClick={async () => {
                      // Ensure the wine is public and has a share_id, then share the public /w/:shareId link
                      const { data: row } = await supabase
                        .from("wines")
                        .select("share_id,is_public")
                        .eq("id", w.id)
                        .maybeSingle();
                      let shareId = row?.share_id as string | null | undefined;
                      if (!row?.is_public || !shareId) {
                        const { data: upd } = await supabase
                          .from("wines")
                          .update({ is_public: true })
                          .eq("id", w.id)
                          .select("share_id")
                          .maybeSingle();
                        shareId = upd?.share_id ?? shareId;
                      }
                      if (!shareId) {
                        toast.error(t("common.error"));
                        return;
                      }
                      const url = `${window.location.origin}/w/${encodeURIComponent(shareId)}`;
                      const shareData = {
                        title: `${w.wine_name ?? ""} ${w.vintage ?? ""}`.trim(),
                        text: t("wine.shareText"),
                        url,
                      };
                      const copyLink = async () => {
                        try {
                          await navigator.clipboard.writeText(url);
                          toast.success(t("wine.linkCopied"));
                          return true;
                        } catch {
                          return false;
                        }
                      };
                      if (navigator.share) {
                        try {
                          await navigator.share(shareData);
                          return;
                        } catch (err) {
                          // User cancelled -> do nothing. Blocked (e.g. inside an iframe) -> copy instead.
                          if (err instanceof DOMException && err.name === "AbortError") return;
                        }
                      }
                      if (!(await copyLink())) {
                        window.prompt(t("wine.share"), url);
                      }
                    }}
                    aria-label={t("wine.share")}
                    className="flex min-h-11 w-full items-center gap-3 text-base"
                  >
                    <Share2 className="h-5 w-5" />
                    {t("wine.share")}
                  </button>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    to="/wine/$id/edit"
                    params={{ id: w.id }}
                    aria-label={t("wine.edit")}
                    className="flex min-h-11 w-full items-center gap-3 text-base"
                  >
                    <Pencil className="h-5 w-5" />
                    {t("wine.edit")}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Hero */}
        <section className="mt-4 flex gap-4">
          <div className="flex h-36 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-burgundy/40 to-background/60 shadow-elegant">
            {w.image_url ? (
              <WineImage src={w.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <Wine className="h-9 w-9 text-gold/60" />
            )}
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h1 className="font-display text-[26px] leading-tight text-cream">
              {w.wine_name ?? w.producer ?? t("type.unknown")}
              {w.vintage ? ` ${w.vintage}` : ""}
            </h1>
            <p className="mt-1 text-base text-gold">
              {[w.region, w.country].filter(Boolean).join(", ") || w.producer}
            </p>
            <p className="text-sm text-muted-foreground">{w.grape_varieties?.join(", ") || "—"}</p>
            {rating != null && (
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="flex items-center gap-1 text-sm">
                  <Star className="h-3.5 w-3.5 fill-gold text-gold" />
                  <span className="font-medium">{rating.toFixed(1)}</span>
                  <span className="text-muted-foreground">
                    {t(w.user_id === user?.id ? "wine.yourRating" : "wine.ownerRating")}
                  </span>
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Tabs */}
        <div className="mt-5 grid grid-cols-3 gap-1 border-b border-white/8 text-sm sm:grid-cols-5">
          {TAB_KEYS.map((k) => (
            <button
              key={k}
              aria-pressed={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                "relative -mb-px min-h-11 px-2 py-2.5 transition-colors",
                tab === k ? "text-gold" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`wine.tab.${k}` as TKey)}
              {tab === k && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-gold" />}
            </button>
          ))}
        </div>

        {tab === "aromas" && (
          <>
            <Section title={t("wine.aromaProfile")}>
              <AromaProfileTabs
                aiAromas={aromas}
                personalAromas={latestPersonalAromas(notes)}
                mineAfter={
                  <Button asChild variant="outline" className="mt-5 w-full min-h-11">
                    <Link to="/wine/$id/notes" params={{ id: w.id }}>
                      <Plus className="h-5 w-5" /> {t("wine.notesAdd")}
                    </Link>
                  </Button>
                }
              />
            </Section>

            <Section title={t("wine.tastingProfile")}>
              <Card className="bg-card/50 p-4">
                <SliderRow
                  label={t("taste.body")}
                  leftLabel={t("taste.light")}
                  rightLabel={t("taste.bold")}
                  value={pct(w.body)}
                />
                <SliderRow
                  label={t("wine.tannins")}
                  leftLabel={t("taste.low")}
                  rightLabel={t("taste.high")}
                  value={pct(w.tannin)}
                />
                <SliderRow
                  label={t("taste.acidity")}
                  leftLabel={t("taste.low")}
                  rightLabel={t("taste.high")}
                  value={pct(w.acidity)}
                />
                <SliderRow
                  label={t("wine.fruit")}
                  leftLabel={t("taste.low")}
                  rightLabel={t("taste.high")}
                  value={pct(w.fruit)}
                />
              </Card>
            </Section>
          </>
        )}

        {tab === "overview" && (
          <div className="mt-5 space-y-4">
            <Section title={t("photos.title")}>
              <PhotoGallery wineId={w.id} fallbackUrl={w.image_url} />
            </Section>
            {w.description && (
              <Card className="bg-card/50 p-4">
                <p className="font-display text-base leading-relaxed text-cream">{w.description}</p>
              </Card>
            )}
            {(() => {
              const win = computeDrinkingWindow(w.vintage, w.wine_type);
              if (!win) return null;
              const statusKey =
                win.status === "too-young"
                  ? "wine.window.tooYoung"
                  : win.status === "past-peak"
                    ? "wine.window.pastPeak"
                    : "wine.window.greatNow";
              const dot =
                win.status === "great-now"
                  ? "bg-success"
                  : win.status === "too-young"
                    ? "bg-gold"
                    : "bg-destructive";
              const now = new Date().getFullYear();
              const pct = Math.max(
                0,
                Math.min(100, ((now - win.start) / Math.max(1, win.end - win.start)) * 100),
              );
              return (
                <Card className="bg-card/50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gold" />
                      <span className="text-sm uppercase tracking-wider text-muted-foreground">
                        {t("wine.window")}
                      </span>
                    </div>
                    <span className="flex items-center gap-1.5 text-sm font-medium text-cream">
                      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
                      {t(statusKey as TKey)}
                    </span>
                  </div>
                  <div className="relative mt-3 h-1.5 rounded-full bg-white/8">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-burgundy via-gold to-copper"
                      style={{ width: `${pct}%` }}
                    />
                    <span
                      className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cream bg-gold"
                      style={{ left: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("wine.window.range")
                      .replace("{start}", String(win.start))
                      .replace("{end}", String(win.end))
                      .replace("{peak}", String(win.peak))}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{t("wine.window.caveat")}</p>
                </Card>
              );
            })()}
            <KV label={t("wine.producer")} value={w.producer ?? "—"} />
            <KV
              label={t("wine.region")}
              value={[w.region, w.country].filter(Boolean).join(", ") || "—"}
            />
            <KV label={t("wine.grape")} value={w.grape_varieties?.join(", ") ?? "—"} />
            <KV label={t("wine.vintage")} value={w.vintage ? String(w.vintage) : "—"} />
            <KV label={t("wine.serving")} value={w.serving_temp ?? "—"} />
            <KV label={t("wine.glass")} value={w.glass_type ?? "—"} />

            <Section title={t("wine.notesSection")}>
              {notes.length === 0 ? (
                <Card className="bg-card/50 p-4 text-center">
                  <p className="text-base text-muted-foreground">{t("wine.notesEmpty")}</p>
                  <Link
                    to="/wine/$id/notes"
                    params={{ id: w.id }}
                    className="mt-3 inline-flex items-center gap-1 text-sm text-burgundy hover:underline"
                  >
                    <Plus className="h-5 w-5" /> {t("wine.notesAdd")}
                  </Link>
                </Card>
              ) : (
                <div className="space-y-2.5">
                  {notes.map((n) => (
                    <Card key={n.id} className="bg-card/50 p-3.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {n.rating != null && (
                            <>
                              <Star className="h-3.5 w-3.5 fill-gold text-gold" />
                              <span className="font-display text-base text-cream">
                                {n.rating.toFixed(1)}
                              </span>
                            </>
                          )}
                        </div>
                        <span className="text-xs uppercase tracking-wider text-muted-foreground">
                          {new Date(n.tasted_at).toLocaleDateString(
                            lang === "sv" ? "sv-SE" : "en-US",
                            { month: "short", day: "numeric", year: "numeric" },
                          )}
                          {n.location ? ` • ${n.location}` : ""}
                        </span>
                      </div>
                      {n.notes && (
                        <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">
                          {n.notes}
                        </p>
                      )}
                      {n.aromas && n.aromas.length > 0 && (
                        <p className="mt-1.5 text-sm text-gold">{n.aromas.join(" • ")}</p>
                      )}
                    </Card>
                  ))}
                  <Link
                    to="/wine/$id/notes"
                    params={{ id: w.id }}
                    className="flex items-center justify-center gap-1 rounded-xl border border-dashed border-gold/40 py-2 text-sm text-gold hover:bg-gold/5"
                  >
                    <Plus className="h-5 w-5" /> {t("wine.notesAdd")}
                  </Link>
                </div>
              )}
            </Section>
          </div>
        )}

        {tab === "tasting" && (
          <div className="mt-5">
            <Card className="bg-card/50 p-4">
              <SliderRow
                label={t("taste.body")}
                leftLabel={t("taste.light")}
                rightLabel={t("taste.bold")}
                value={pct(w.body)}
              />
              <SliderRow
                label={t("wine.tannins")}
                leftLabel={t("taste.low")}
                rightLabel={t("taste.high")}
                value={pct(w.tannin)}
              />
              <SliderRow
                label={t("taste.acidity")}
                leftLabel={t("taste.low")}
                rightLabel={t("taste.high")}
                value={pct(w.acidity)}
              />
              <SliderRow
                label={t("wine.fruit")}
                leftLabel={t("taste.low")}
                rightLabel={t("taste.high")}
                value={pct(w.fruit)}
              />
              <SliderRow
                label={t("taste.oak")}
                leftLabel={t("taste.noOak")}
                rightLabel={t("taste.oaked")}
                value={pct(w.oak)}
              />
              <SliderRow
                label={t("taste.sweetness")}
                leftLabel={t("taste.dry")}
                rightLabel={t("taste.sweet")}
                value={pct(w.sweetness)}
              />
            </Card>
          </div>
        )}

        {tab === "food" && (
          <div className="mt-5 space-y-3">
            {(w.food_pairings ?? []).map((p, i) => (
              <Card key={i} className="bg-card/50 p-4">
                <p className="font-display text-base text-cream">{p.dish}</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.reason}</p>
              </Card>
            ))}
            {(!w.food_pairings || w.food_pairings.length === 0) && (
              <p className="py-6 text-center text-base text-muted-foreground">
                {t("wine.noPairings")}
              </p>
            )}
          </div>
        )}

        {tab === "ai" && (
          <div className="mt-5 space-y-3">
            {suggestLoading && (
              <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-base">{t("wine.finding")}</span>
              </div>
            )}
            {suggestError && !suggestLoading && (
              <Card className="bg-card/50 p-4 text-center text-base text-destructive">
                {suggestError}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadSuggestions}
                  className="mt-2 min-h-11"
                >
                  {t("common.retry")}
                </Button>
              </Card>
            )}
            {!suggestLoading && !suggestError && suggestions && suggestions.length === 0 && (
              <p className="py-6 text-center text-base text-muted-foreground">
                {t("wine.noSuggestions")}
              </p>
            )}
            {!suggestLoading &&
              suggestions?.map((s) => (
                <Card key={recommendationKey(s)} className="rounded-md bg-card/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-base text-cream">{s.wine_name}</p>
                      <p className="text-sm text-gold">{s.producer}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {[s.region, s.country].filter(Boolean).join(", ")}
                        {s.grape_varieties?.length ? ` • ${s.grape_varieties.join(", ")}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 border-y border-white/8 py-3">
                    <RecommendationMatch
                      score={s.match_score}
                      confidence={s.match_confidence}
                      evidence={s.match_evidence ?? []}
                    />
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/80">{s.reason}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("recommendation.styleEstimate")}
                  </p>
                  <a
                    href={s.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center text-sm text-gold"
                  >
                    {t("recommendation.identitySource")}
                  </a>
                  {s.price_range && (
                    <p className="mt-1.5 font-display text-sm text-cream">{s.price_range}</p>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => sendSuggestionFeedback(s, "like")}
                        aria-label={t("recommendation.like")}
                        title={t("recommendation.like")}
                        className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-md border min-h-11 min-w-11",
                          suggestFeedback[recommendationKey(s)] === "like"
                            ? "border-success/40 bg-success/15 text-success"
                            : "border-white/10 text-muted-foreground",
                        )}
                      >
                        <ThumbsUp className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => sendSuggestionFeedback(s, "dislike")}
                        aria-label={t("recommendation.notForMe")}
                        title={t("recommendation.notForMe")}
                        className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-md border min-h-11 min-w-11",
                          suggestFeedback[recommendationKey(s)] === "dislike"
                            ? "border-destructive/40 bg-destructive/15 text-destructive"
                            : "border-white/10 text-muted-foreground",
                        )}
                      >
                        <ThumbsDown className="h-5 w-5" />
                      </button>
                    </div>
                    <button
                      onClick={() => saveSuggestion(s)}
                      className="flex h-11 items-center gap-1.5 rounded-md border border-gold/30 px-2.5 text-sm text-gold min-h-11 min-w-11"
                    >
                      <Bookmark className="h-5 w-5" /> {t("wishlist.saveBtn")}
                    </button>
                  </div>
                </Card>
              ))}
            {!suggestLoading && suggestions && suggestions.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSuggestions(null);
                  loadSuggestions();
                }}
                className="w-full min-h-11"
              >
                <Sparkles className="h-5 w-5" /> {t("wine.regenerate")}
              </Button>
            )}
          </div>
        )}

        <Button
          variant="ghost"
          onClick={remove}
          className="mt-8 mb-4 w-full text-destructive hover:bg-destructive/10 hover:text-destructive min-h-11"
        >
          <Trash2 className="h-5 w-5" /> {t("wine.delete")}
        </Button>
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 font-display text-lg text-cream">{title}</h2>
      {children}
    </section>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-white/8 pb-2.5">
      <span className="text-sm uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-right font-display text-base text-cream">{value}</span>
    </div>
  );
}

function SliderRow({
  label,
  leftLabel,
  rightLabel,
  value,
}: {
  label: string;
  leftLabel: string;
  rightLabel: string;
  value: number;
}) {
  return (
    <div className="grid grid-cols-[64px_36px_1fr_36px] items-center gap-2 py-2">
      <span className="text-sm text-foreground/80">{label}</span>
      <span className="text-xs text-muted-foreground">{leftLabel}</span>
      <div className="relative h-1 rounded-full bg-white/10">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold/80 to-copper"
          style={{ width: `${value}%` }}
        />
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cream bg-gold shadow"
          style={{ left: `${value}%` }}
        />
      </div>
      <span className="text-right text-xs text-muted-foreground">{rightLabel}</span>
    </div>
  );
}

function pct(v: number | null): number {
  if (v == null) return 50;
  return Math.max(0, Math.min(100, v * 10));
}

function latestPersonalAromas(notes: TastingNote[]) {
  const latest = notes[0];
  const intensities = normalizeIntensities(latest?.aroma_intensities);
  return (latest?.aromas ?? []).map((name) => ({
    name,
    active: true,
    intensity: intensities[name] ?? null,
  }));
}
