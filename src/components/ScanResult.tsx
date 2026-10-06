import { useId, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ExternalLink,
  GlassWater,
  Loader2,
  Pencil,
  Sparkles,
  Thermometer,
  Utensils,
  Wine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AromaIcon } from "@/components/AromaIcon";
import { AromaRows } from "@/components/AromaProfileTabs";
import { useT, type TKey } from "@/i18n";
import type { AnalyzedWine } from "@/lib/scanIdentity";
import {
  applyScanIdentity,
  scanAromas,
  scanIdentityDraft,
  scanPairings,
  scanTasteBand,
  SCAN_WINE_TYPES,
  type ScanIdentityDraft,
} from "@/lib/scanResult";

export type ScanResultProps = {
  wine: AnalyzedWine;
  imageUrl: string | null;
  labelText: string;
  mode: "camera" | "text";
  partial: boolean;
  edited: boolean;
  saved: boolean;
  busy: boolean;
  onEdit: (wine: AnalyzedWine) => void;
  onSave: () => void;
  onClose: () => void;
  onDetails: () => void;
  onCellar: () => void;
};

export function ScanResult({
  wine,
  imageUrl,
  labelText,
  mode,
  partial,
  edited,
  saved,
  busy,
  onEdit,
  onSave,
  onClose,
  onDetails,
  onCellar,
}: ScanResultProps) {
  const t = useT();
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const aromas = scanAromas(wine);
  const pairings = scanPairings(wine.food_pairings);
  const description = wine.description?.trim();
  const shortened = description && description.length > 240;
  const summary =
    shortened && !descriptionOpen
      ? `${description.slice(0, description.lastIndexOf(" ", 220) > 0 ? description.lastIndexOf(" ", 220) : 220)}…`
      : description;
  const source = edited
    ? t("scan.corrected")
    : mode === "text"
      ? t("scan.fromText")
      : t("scan.fromLabel");
  const knownType = SCAN_WINE_TYPES.find((type) => type === wine.wine_type);

  return (
    <div
      className="fixed inset-0 z-50 flex h-dvh flex-col bg-background text-foreground"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <header className="mx-auto flex w-full max-w-2xl shrink-0 items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          disabled={busy}
          aria-label={saved ? t("wine.backToCellar") : t("scan.discard")}
          title={saved ? t("wine.backToCellar") : t("scan.discard")}
          onClick={saved ? onCellar : onClose}
          className="h-11 w-11 shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <p className="text-base font-medium">{t("scan.result")}</p>
        <span className="w-11 shrink-0" />
      </header>

      <main
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        aria-label={t("scan.result")}
      >
        <div className="mx-auto w-full max-w-2xl px-5 pb-6 pt-2 sm:px-7">
          {saved && (
            <p
              role="status"
              className="mb-3 flex items-center gap-2 text-base font-medium text-success"
            >
              <Check className="h-5 w-5" />
              {t("scan.savedToCellar")}
            </p>
          )}
          <section aria-label={t("scan.wineFacts")}>
            <div className="flex items-start gap-4">
              <div className="flex h-36 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-card/60 sm:h-44 sm:w-28">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={t("scan.imageAlt")}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Wine className="h-9 w-9 text-gold/60" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-sm text-gold">{source}</p>
                <h1 className="break-words font-display text-[28px] leading-tight text-cream">
                  {wine.wine_name || wine.producer || t("wine.unknown")}
                </h1>
                {wine.producer && wine.wine_name && (
                  <p className="mt-1 break-words text-base text-cream/90">{wine.producer}</p>
                )}
                <p className="mt-1 break-words text-sm text-muted-foreground">
                  {[wine.region, wine.country].filter(Boolean).join(", ") || t("scan.originUnread")}
                </p>
                <p className="mt-2 text-base font-medium text-gold">
                  {wine.vintage ?? t("scan.vintageUnread")}
                  {knownType && (
                    <span className="ml-2 text-cream/85">
                      · {t(`type.${knownType}` as TKey)}
                      {!edited && (
                        <span
                          className="ml-1 text-xs text-muted-foreground"
                          title={t("scan.aiEstimate")}
                        >
                          ({t("scan.aiShort")})
                        </span>
                      )}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <p className="mt-3 break-words text-base text-cream/90">
              <span className="text-muted-foreground">{t("scan.fieldGrapes")}: </span>
              {wine.grape_varieties?.length ? wine.grape_varieties.join(", ") : t("scan.unread")}
            </p>
            {partial && !edited && (
              <p className="mt-2 text-sm leading-relaxed text-gold">{t("scan.partialResult")}</p>
            )}
          </section>

          <section
            className="mt-4 border-t border-white/10 pt-4"
            aria-labelledby="scan-style-title"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="scan-style-title" className="font-display text-xl text-cream">
                {t("scan.wineStyle")}
              </h2>
              <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 text-gold" />
                {t("scan.aiEstimate")}
              </span>
            </div>
            <p className="mt-2 break-words text-base leading-relaxed text-cream/90">
              {summary || t(edited ? "scan.estimateCleared" : "scan.noDescription")}
            </p>
            {shortened && (
              <button
                type="button"
                onClick={() => setDescriptionOpen(!descriptionOpen)}
                aria-expanded={descriptionOpen}
                className="min-h-11 text-sm text-gold underline underline-offset-4"
              >
                {t(descriptionOpen ? "scan.readLess" : "scan.readMore")}
              </button>
            )}
            <div className="mt-3 grid grid-cols-3 gap-3">
              <TasteSummary label={t("taste.body")} value={wine.body} kind="body" />
              <TasteSummary label={t("taste.acidity")} value={wine.acidity} kind="acidity" />
              <TasteSummary label={t("taste.sweetness")} value={wine.sweetness} kind="sweetness" />
            </div>
            {aromas.length > 0 && (
              <ul
                aria-label={t("scan.mainAromas")}
                className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4"
              >
                {aromas.slice(0, 4).map((name) => (
                  <li key={name} className="flex min-w-0 items-center gap-2">
                    <AromaIcon name={name} size={32} />
                    <span className="min-w-0 break-words text-sm leading-snug text-cream">
                      {name}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            className="mt-4 border-t border-white/10 pt-4"
            aria-labelledby="scan-serving-title"
          >
            <h2 id="scan-serving-title" className="font-display text-xl text-cream">
              {t("scan.serveEnjoy")}
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <ServingFact
                icon={<Thermometer className="h-5 w-5 text-gold" />}
                label={t("wine.serving")}
                value={wine.serving_temp}
              />
              <ServingFact
                icon={<GlassWater className="h-5 w-5 text-gold" />}
                label={t("wine.glass")}
                value={wine.glass_type}
              />
            </div>
            {wine.decant != null && (
              <p className="mt-2 text-sm text-muted-foreground">
                {t(wine.decant ? "scan.decant" : "scan.noDecant")}
              </p>
            )}
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Utensils className="h-5 w-5 text-gold" />
              {t("scan.foodMatches")}
            </div>
            {pairings.length ? (
              <ul className="mt-2 space-y-2">
                {pairings.slice(0, 2).map((pair, index) => (
                  <li key={`${pair.dish}-${index}`}>
                    <p className="break-words text-base font-medium text-cream">{pair.dish}</p>
                    {pair.reason && (
                      <p className="mt-0.5 break-words text-sm leading-relaxed text-muted-foreground">
                        {pair.reason}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-base text-muted-foreground">{t("scan.noPairings")}</p>
            )}
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {t("scan.tasteEstimate")}
            </p>
          </section>

          <details className="mt-4 border-t border-white/10">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-base text-cream">
              {t("scan.allDetails")}
              <ChevronDown className="h-5 w-5 shrink-0 text-gold" />
            </summary>
            <dl className="space-y-3 py-3">
              {[
                [t("scan.fieldProducer"), wine.producer],
                [t("scan.fieldRegion"), wine.region],
                [t("edit.country"), wine.country],
              ].map(([label, value]) => (
                <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="break-words text-base text-cream">{value || t("scan.unread")}</dd>
                </div>
              ))}
            </dl>
            {aromas.length > 4 && (
              <AromaRows
                aromas={aromas.map((name) => ({ name, active: true, intensity: null }))}
                readOnly
              />
            )}
            {pairings.slice(2).map((pair, index) => (
              <p key={`${pair.dish}-${index}`} className="mt-3 break-words text-base text-cream">
                {pair.dish}
                {pair.reason && (
                  <span className="block text-sm text-muted-foreground">{pair.reason}</span>
                )}
              </p>
            ))}
          </details>
          {labelText.trim() && (
            <details className="mt-1 border-t border-white/10">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-base text-cream">
                {t(mode === "text" ? "scan.originalText" : "scan.labelRead")}
                <ChevronDown className="h-5 w-5 shrink-0 text-gold" />
              </summary>
              <p className="whitespace-pre-wrap break-words py-3 text-sm leading-relaxed text-muted-foreground">
                {labelText.trim()}
              </p>
            </details>
          )}
        </div>
      </main>

      <footer className="shrink-0 border-t border-white/10 bg-background px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] sm:px-6">
        <div className="mx-auto grid w-full max-w-2xl grid-cols-[48px_minmax(0,1fr)] gap-3">
          {saved ? (
            <Button
              variant="outline"
              size="icon"
              disabled={busy}
              aria-label={t("scan.viewDetails")}
              title={t("scan.viewDetails")}
              onClick={onDetails}
              className="h-12 w-12"
            >
              <ExternalLink className="h-5 w-5" />
            </Button>
          ) : (
            <ScanIdentityEditor wine={wine} disabled={busy} onApply={onEdit} />
          )}
          <Button
            disabled={busy}
            onClick={saved ? onCellar : onSave}
            className="h-12 min-w-0 bg-gradient-burgundy px-3 text-base text-cream"
          >
            {busy ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
            ) : saved ? (
              <Wine className="h-5 w-5 shrink-0" />
            ) : (
              <Check className="h-5 w-5 shrink-0" />
            )}
            {t(saved ? "wine.backToCellar" : "scan.addToCellar")}
          </Button>
        </div>
      </footer>
    </div>
  );
}

function TasteSummary({
  label,
  value,
  kind,
}: {
  label: string;
  value: number | null | undefined;
  kind: "body" | "acidity" | "sweetness";
}) {
  const t = useT();
  const band = scanTasteBand(value);
  const text = band ? t(`scan.${kind}.${band}` as TKey) : t("scan.notEstimated");
  return (
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-base font-medium text-cream">{text}</p>
      <div aria-hidden="true" className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className={`h-1.5 min-w-0 flex-1 rounded-sm ${band && step <= Math.ceil(value! / 2) ? "bg-gold/80" : "bg-white/10"}`}
          />
        ))}
      </div>
    </div>
  );
}

function ServingFact({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  const t = useT();
  return (
    <div className="flex min-w-0 items-start gap-2">
      {icon}
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-0.5 break-words text-base font-medium text-cream">
          {value || t("scan.notEstimated")}
        </p>
      </div>
    </div>
  );
}

function ScanIdentityEditor({
  wine,
  disabled,
  onApply,
}: {
  wine: AnalyzedWine;
  disabled: boolean;
  onApply: (wine: AnalyzedWine) => void;
}) {
  const t = useT();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => scanIdentityDraft(wine));
  const [error, setError] = useState<string | null>(null);
  const fields: [keyof ScanIdentityDraft, TKey][] = [
    ["wine_name", "scan.fieldName"],
    ["producer", "scan.fieldProducer"],
    ["vintage", "scan.fieldVintage"],
    ["region", "scan.fieldRegion"],
    ["country", "edit.country"],
    ["grape_varieties", "scan.fieldGrapes"],
  ];
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(scanIdentityDraft(wine));
          setError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          disabled={disabled}
          aria-label={t("scan.editDetails")}
          title={t("scan.editDetails")}
          className="h-12 w-12"
        >
          <Pencil className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-md p-5 [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center">
        <DialogHeader>
          <DialogTitle className="pr-8 font-display text-2xl tracking-normal">
            {t("scan.editDetails")}
          </DialogTitle>
          <DialogDescription className="pr-6 text-sm leading-relaxed">
            {t("scan.editHint")}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const result = applyScanIdentity(wine, draft);
            if ("error" in result) {
              setError(t(`scan.invalid.${result.error}` as TKey));
              return;
            }
            if (result.changed) onApply(result.wine);
            setOpen(false);
          }}
          className="space-y-3"
        >
          {fields.map(([key, label]) => (
            <div key={key}>
              <label htmlFor={`${id}-${key}`} className="mb-1 block text-sm text-muted-foreground">
                {t(label)}
              </label>
              <Input
                id={`${id}-${key}`}
                value={draft[key]}
                maxLength={key === "vintage" ? 4 : 300}
                inputMode={key === "vintage" ? "numeric" : "text"}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, [key]: event.target.value }))
                }
                placeholder={key === "grape_varieties" ? t("edit.grapesPh") : undefined}
              />
            </div>
          ))}
          <div>
            <label htmlFor={`${id}-wine_type`} className="mb-1 block text-sm text-muted-foreground">
              {t("scan.fieldType")}
            </label>
            <select
              id={`${id}-wine_type`}
              value={draft.wine_type}
              onChange={(event) =>
                setDraft((current) => ({ ...current, wine_type: event.target.value }))
              }
              className="h-12 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">{t("scan.unread")}</option>
              {SCAN_WINE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`type.${type}` as TKey)}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="sticky bottom-0 grid grid-cols-2 gap-3 bg-background py-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-12">
              {t("common.cancel")}
            </Button>
            <Button type="submit" className="h-12 bg-gradient-burgundy text-cream">
              <Check className="h-5 w-5" />
              {t("scan.apply")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
