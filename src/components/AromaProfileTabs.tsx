import type { ReactNode } from "react";
import { AromaIcon, aromaFamilyLabel } from "@/components/AromaIcon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/i18n";
import type { AromaDraft } from "@/lib/tastingNotes";
import { cn } from "@/lib/utils";

type AromaProfileTabsProps = {
  aiAromas: string[];
  personalAromas: AromaDraft[];
  editable?: boolean;
  mineAction?: ReactNode;
  mineAfter?: ReactNode;
  onActive?: (index: number, active: boolean) => void;
  onIntensity?: (index: number, intensity: number) => void;
};

export function AromaProfileTabs({
  aiAromas,
  personalAromas,
  editable = false,
  mineAction,
  mineAfter,
  onActive,
  onIntensity,
}: AromaProfileTabsProps) {
  const t = useT();
  return (
    <Tabs defaultValue="mine">
      <TabsList className="grid h-11 w-full grid-cols-2 rounded-md border border-border bg-card/60 p-1">
        <TabsTrigger value="ai" className="rounded-sm">
          {t("notes.tab.ai")}
        </TabsTrigger>
        <TabsTrigger value="mine" className="rounded-sm">
          {t("notes.tab.mine")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="ai" className="mt-6">
        <h2 className="font-display text-lg text-gold">{t("notes.aiAromas")}</h2>
        {aiAromas.length ? (
          <AromaRows
            aromas={aiAromas.map((name) => ({ name, active: true, intensity: null }))}
            readOnly
          />
        ) : (
          <EmptyAromas text={t("notes.aiEmpty")} />
        )}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          {t("notes.aiDisclaimer")}
        </p>
      </TabsContent>

      <TabsContent value="mine" className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg text-gold">{t("notes.myAromas")}</h2>
          {mineAction}
        </div>
        {personalAromas.length ? (
          <AromaRows
            aromas={personalAromas}
            readOnly={!editable}
            onActive={onActive}
            onIntensity={onIntensity}
          />
        ) : (
          <EmptyAromas text={t("notes.aromasEmpty")} />
        )}
        {mineAfter}
      </TabsContent>
    </Tabs>
  );
}

function EmptyAromas({ text }: { text: string }) {
  return <p className="border-y border-border py-5 text-sm text-muted-foreground">{text}</p>;
}

export function AromaRows({
  aromas,
  readOnly = false,
  onActive,
  onIntensity,
}: {
  aromas: AromaDraft[];
  readOnly?: boolean;
  onActive?: (index: number, active: boolean) => void;
  onIntensity?: (index: number, value: number) => void;
}) {
  const t = useT();
  return (
    <ul className="mt-3 divide-y divide-border border-y border-border">
      {aromas.map((aroma, index) => (
        <li
          key={`${aroma.name}-${index}`}
          className={cn("flex min-h-20 items-center gap-3 py-3", !aroma.active && "opacity-55")}
        >
          {!readOnly && (
            <Checkbox
              checked={aroma.active}
              onCheckedChange={(checked) => onActive?.(index, checked === true)}
              aria-label={t("notes.aromaActive").replace("{name}", aroma.name)}
            />
          )}
          <AromaIcon name={aroma.name} size={48} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-base leading-tight text-cream">{aroma.name}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{aromaFamilyLabel(aroma.name)}</p>
            {readOnly && aroma.intensity != null && (
              <p className="mt-1 text-xs text-gold">{aroma.intensity}/5</p>
            )}
            {!readOnly && (
              <div className="mt-2">
                <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>{t("notes.weak")}</span>
                  <span>
                    {aroma.intensity == null ? t("notes.notSet") : `${aroma.intensity}/5`}
                  </span>
                  <span>{t("notes.clear")}</span>
                </div>
                {aroma.intensity == null ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!aroma.active}
                    onClick={() => onIntensity?.(index, 1)}
                    className="w-full"
                  >
                    {t("notes.chooseIntensity")}
                  </Button>
                ) : (
                  <Slider
                    min={1}
                    max={5}
                    step={1}
                    value={[aroma.intensity]}
                    disabled={!aroma.active}
                    onValueChange={(value) => value[0] != null && onIntensity?.(index, value[0])}
                    aria-label={t("notes.intensityFor").replace("{name}", aroma.name)}
                  />
                )}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
