import { CircleCheck, CircleMinus } from "lucide-react";
import { useT } from "@/i18n";
import type { MatchEvidence } from "@/lib/recommendationEngine";
import { cn } from "@/lib/utils";

type RecommendationMatchProps = {
  score: number;
  confidence: "low" | "medium" | "high";
  evidence: MatchEvidence[];
  compact?: boolean;
};

export function RecommendationMatch({
  score,
  confidence,
  evidence,
  compact = false,
}: RecommendationMatchProps) {
  const t = useT();
  const visibleEvidence = evidence.slice(0, compact ? 2 : 3);

  return (
    <div className={cn("flex gap-3", compact ? "items-center" : "items-start")}>
      <div className="shrink-0 text-right">
        <p className="font-display text-lg leading-none text-gold">{Math.round(score)}%</p>
        <p className="mt-1 text-[10px] uppercase text-muted-foreground">
          {t("recommendation.tasteMatch")}
        </p>
      </div>
      <div className="min-w-0 flex-1 border-l border-white/10 pl-3">
        <p className="text-[10px] uppercase text-muted-foreground">
          {t(`recommendation.confidence.${confidence}`)}
        </p>
        {!compact && visibleEvidence.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {visibleEvidence.map((item, index) => {
              const Icon = item.direction === "positive" ? CircleCheck : CircleMinus;
              return (
                <span
                  key={`${item.attribute}-${item.value}-${index}`}
                  className={cn(
                    "inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-1 text-[10px]",
                    item.direction === "positive"
                      ? "border-success/25 bg-success/8 text-foreground/80"
                      : "border-destructive/25 bg-destructive/8 text-foreground/70",
                  )}
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{item.value}</span>
                </span>
              );
            })}
          </div>
        )}
        {!compact && visibleEvidence.length === 0 && (
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {t("recommendation.coldStart")}
          </p>
        )}
      </div>
    </div>
  );
}
