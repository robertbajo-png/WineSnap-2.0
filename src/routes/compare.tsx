import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Scale, Wine } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { RecommendationMatch } from "@/components/RecommendationMatch";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import {
  scorePersonalizedCandidate,
  scoreWineSimilarity,
  type ExplicitTasteProfile,
  type RecommendationCandidate,
  type RecommendationPreference,
} from "@/lib/recommendationEngine";
import { recordRecommendationEvent } from "@/lib/recommendationEvents";

type CompareSearch = { left?: string; right?: string };

export const Route = createFileRoute("/compare")({
  validateSearch: (search: Record<string, unknown>): CompareSearch => ({
    left: typeof search.left === "string" ? search.left : undefined,
    right: typeof search.right === "string" ? search.right : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Compare wines — WineSnap" },
      { name: "description", content: "Compare two cellar wines and their personal taste fit." },
    ],
  }),
  component: ComparePage,
});

type CompareWine = RecommendationCandidate & {
  id: string;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  region: string | null;
  country: string | null;
  wine_type: string | null;
  grape_varieties: string[] | null;
};

const STRUCTURE = ["body", "tannin", "acidity", "sweetness", "oak", "fruit"] as const;

function ComparePage() {
  const { user, loading: authLoading } = useAuth();
  const t = useT();
  const search = Route.useSearch();
  const [wines, setWines] = useState<CompareWine[]>([]);
  const [profile, setProfile] = useState<ExplicitTasteProfile | null>(null);
  const [memory, setMemory] = useState<RecommendationPreference[]>([]);
  const [leftId, setLeftId] = useState(search.left ?? "");
  const [rightId, setRightId] = useState(search.right ?? "");
  const [loading, setLoading] = useState(true);
  const [logged, setLogged] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    Promise.all([
      supabase
        .from("wines")
        .select(
          "id,producer,wine_name,vintage,region,country,wine_type,grape_varieties,primary_notes,secondary_notes,tertiary_notes,body,tannin,acidity,sweetness,oak,fruit",
        )
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("profiles")
        .select(
          "preferred_types,preferred_regions,preferred_grapes,body,tannin,acidity,sweetness,oak",
        )
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("derived_preferences")
        .select("attribute,value_text,value_number,preference_score,confidence,evidence_count")
        .eq("user_id", user.id)
        .gte("confidence", 0.35),
    ]).then(([wineResult, profileResult, memoryResult]) => {
      const cellar = (wineResult.data ?? []) as CompareWine[];
      setWines(cellar);
      setProfile(profileResult.data as ExplicitTasteProfile | null);
      setMemory((memoryResult.data ?? []) as RecommendationPreference[]);

      const validLeft = cellar.some((wine) => wine.id === search.left);
      const initialLeft = validLeft ? search.left! : (cellar[0]?.id ?? "");
      const validRight = cellar.some((wine) => wine.id === search.right && wine.id !== initialLeft);
      setLeftId(initialLeft);
      setRightId(
        validRight ? search.right! : (cellar.find((wine) => wine.id !== initialLeft)?.id ?? ""),
      );
      setLoading(false);
    });
  }, [search.left, search.right, user]);

  useEffect(() => setLogged(false), [leftId, rightId]);

  const left = useMemo(() => wines.find((wine) => wine.id === leftId) ?? null, [leftId, wines]);
  const right = useMemo(() => wines.find((wine) => wine.id === rightId) ?? null, [rightId, wines]);
  const leftMatch = left ? scorePersonalizedCandidate(left, profile, memory) : null;
  const rightMatch = right ? scorePersonalizedCandidate(right, profile, memory) : null;
  const similarity = left && right ? scoreWineSimilarity(left, right) : null;

  const saveComparison = async () => {
    if (!left || !right || !similarity) return;
    const saved = await recordRecommendationEvent("compare", "compare", left, {
      left_wine_id: left.id,
      right_wine_id: right.id,
      similarity_score: similarity.score,
    });
    if (!saved) {
      toast.error(t("recommendation.feedbackError"));
      return;
    }
    setLogged(true);
    toast.success(t("compare.logged"));
  };

  if (!authLoading && !user) {
    return (
      <AppShell>
        <div className="mt-20 text-center">
          <p className="text-muted-foreground">{t("compare.signIn")}</p>
          <Link to="/login">
            <Button className="mt-4 bg-gradient-burgundy text-cream">{t("login.signIn")}</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        <header className="grid grid-cols-[36px_1fr_36px] items-center">
          <Link
            to="/cellar"
            aria-label={t("common.back")}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="text-center">
            <h1 className="font-display text-2xl text-gold">{t("compare.title")}</h1>
            <p className="mt-1 text-[11px] text-muted-foreground">{t("compare.subtitle")}</p>
          </div>
          <Scale className="mx-auto h-4 w-4 text-gold/70" />
        </header>

        {!loading && wines.length < 2 ? (
          <EmptyState
            icon={Wine}
            title={t("compare.title")}
            description={t("compare.needTwo")}
            action={
              <Link to="/scan">
                <Button>{t("cellar.add")}</Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <WinePicker
                label={t("compare.first")}
                value={leftId}
                wines={wines}
                excludedId={rightId}
                onChange={setLeftId}
                placeholder={t("compare.choose")}
              />
              <WinePicker
                label={t("compare.second")}
                value={rightId}
                wines={wines}
                excludedId={leftId}
                onChange={setRightId}
                placeholder={t("compare.choose")}
              />
            </div>

            {left && right && leftMatch && rightMatch && similarity && (
              <div className="pb-5">
                <div className="mt-5 border-y border-white/10 py-4 text-center">
                  <p className="font-display text-3xl text-gold">{similarity.score}%</p>
                  <p className="mt-1 text-[10px] uppercase text-muted-foreground">
                    {t("compare.similarity")}
                  </p>
                </div>

                <div className="grid grid-cols-2 divide-x divide-white/10 border-b border-white/10">
                  <WineSummary wine={left} match={leftMatch} />
                  <WineSummary wine={right} match={rightMatch} />
                </div>

                <section className="mt-6">
                  <h2 className="font-display text-lg text-cream">{t("compare.structure")}</h2>
                  <div className="mt-3 space-y-3">
                    {STRUCTURE.map((attribute) => (
                      <StructureRow
                        key={attribute}
                        label={t(`compare.${attribute}`)}
                        left={left[attribute]}
                        right={right[attribute]}
                      />
                    ))}
                  </div>
                </section>

                <Button
                  onClick={saveComparison}
                  disabled={logged}
                  className="mt-6 w-full bg-gradient-burgundy text-cream"
                >
                  {logged ? <Check className="h-4 w-4" /> : <Scale className="h-4 w-4" />}
                  {logged ? t("compare.logged") : t("compare.log")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function WinePicker({
  label,
  value,
  wines,
  excludedId,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  wines: CompareWine[];
  excludedId: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="min-w-0 text-[11px] text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-11 w-full min-w-0 rounded-md border border-white/10 bg-card px-2 text-xs text-foreground focus:border-gold/50 focus:outline-none"
      >
        <option value="">{placeholder}</option>
        {wines.map((wine) => (
          <option key={wine.id} value={wine.id} disabled={wine.id === excludedId}>
            {wineLabel(wine)}
          </option>
        ))}
      </select>
    </label>
  );
}

function WineSummary({
  wine,
  match,
}: {
  wine: CompareWine;
  match: ReturnType<typeof scorePersonalizedCandidate>;
}) {
  return (
    <div className="min-w-0 px-3 py-4 first:pl-0 last:pr-0">
      <Link to="/wine/$id" params={{ id: wine.id }} className="block min-w-0">
        <p className="truncate font-display text-sm text-cream">
          {wine.wine_name ?? wine.producer}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-gold">
          {[wine.region, wine.country].filter(Boolean).join(", ")}
        </p>
      </Link>
      <div className="mt-3">
        <RecommendationMatch
          score={match.score}
          confidence={match.confidence}
          evidence={match.evidence}
          compact
        />
      </div>
    </div>
  );
}

function StructureRow({
  label,
  left,
  right,
}: {
  label: string;
  left: number | null | undefined;
  right: number | null | undefined;
}) {
  const leftValue = Math.max(0, Math.min(10, Number(left) || 0));
  const rightValue = Math.max(0, Math.min(10, Number(right) || 0));
  return (
    <div className="grid grid-cols-[1fr_70px_1fr] items-center gap-2">
      <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
        <div
          className="ml-auto h-full rounded-full bg-burgundy"
          style={{ width: `${leftValue * 10}%` }}
        />
      </div>
      <p className="text-center text-[10px] uppercase text-muted-foreground">{label}</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full bg-gold" style={{ width: `${rightValue * 10}%` }} />
      </div>
    </div>
  );
}

function wineLabel(wine: CompareWine) {
  return [wine.producer, wine.wine_name, wine.vintage].filter(Boolean).join(" ");
}
