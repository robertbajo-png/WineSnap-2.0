import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ExternalLink, Pause, Pencil, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { MobileDetails } from "./MobileDetails";
import { useT } from "@/i18n";
import { summarizeCellarPrices } from "@/lib/cellarValue";
import {
  canConfirmPrice,
  initialPriceProgress,
  priceCandidates,
  priceFreshness,
  priceResponseSchema,
  runPriceBatches,
  type PriceProgress,
  type PriceRequest,
  type RetailWine,
} from "@/lib/retailPrices";

type Props = {
  wines: RetailWine[];
  ready: boolean;
  request: (input: PriceRequest, signal: AbortSignal) => Promise<unknown>;
  reload: (ids: string[]) => Promise<void>;
};
const commandClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gold/30 px-3 py-2 text-base text-gold disabled:opacity-50";
const statusClass = {
  fresh: "text-emerald-300",
  old: "text-amber-200",
  unverified: "text-muted-foreground",
  missing: "text-muted-foreground",
};
function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return String(value);
  }
}
function date(value: string | null | undefined) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString() : null;
}

export function RetailPricePanel({ wines, ready, request, reload }: Props) {
  const t = useT();
  const active = wines.filter((w) => !w.consumed_at && (w.quantity ?? 1) > 0);
  const counts = { fresh: 0, old: 0, unverified: 0, missing: 0 };
  for (const wine of active) counts[priceFreshness(wine)]++;
  const summary = summarizeCellarPrices(
    active.filter((w) => priceFreshness(w) === "fresh"),
    "retail",
  );
  const [progress, setProgress] = useState<PriceProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [failure, setFailure] = useState<"failed" | "setup" | null>(null);
  const stop = useRef(false);
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef<PriceProgress | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop.current = true;
      controller.current?.abort();
    };
  }, []);

  async function refresh(resume: boolean) {
    if (lock.current || !ready) return;
    lock.current = true;
    stop.current = false;
    const abort = new AbortController();
    controller.current = abort;
    const initial =
      resume && latest.current ? latest.current : initialPriceProgress(active.map((w) => w.id));
    latest.current = initial;
    setProgress(initial);
    setBusy(true);
    setRefreshing(true);
    setStopping(false);
    setFailure(null);
    try {
      const done = await runPriceBatches(
        initial,
        (wineIds) => request({ action: "refresh", wineIds }, abort.signal),
        async (next, results) => {
          latest.current = next;
          if (!mounted.current) return;
          setProgress(next);
          await reload(results.map((r) => r.wineId));
        },
        () => stop.current || abort.signal.aborted,
      );
      if (mounted.current && !done.remaining.length) {
        if (done.failed) toast.error(`${t("prices.error")} (${done.failed})`);
        else
          toast.success(
            `${t("prices.finished")}: ${done.matched} ${t("prices.fresh")}, ${done.review} ${t("prices.review")}`,
          );
      }
    } catch (error) {
      if (mounted.current && !abort.signal.aborted)
        setFailure(
          error instanceof Error && error.message === "migration_required" ? "setup" : "failed",
        );
    } finally {
      lock.current = false;
      if (mounted.current) {
        setBusy(false);
        setRefreshing(false);
        setStopping(false);
      }
    }
  }

  async function confirm(wineId: string, productNumber: string) {
    if (lock.current || !ready) return;
    lock.current = true;
    setBusy(true);
    setFailure(null);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const parsed = priceResponseSchema.parse(
        await request(
          { action: "confirm", wineId, productNumber, acknowledged: true },
          abort.signal,
        ),
      );
      const result =
        parsed.results.length === 1 && parsed.results[0].wineId === wineId
          ? parsed.results[0]
          : null;
      if (!result) throw new Error("Invalid confirmation response");
      if (!mounted.current) return;
      await reload([wineId]);
      if (result.status === "matched") toast.success(t("overview.valuesUpdated"));
      else toast.error(t(result.status === "error" ? "prices.error" : "prices.changed"));
    } catch (error) {
      if (mounted.current && !abort.signal.aborted)
        setFailure(
          error instanceof Error && error.message === "migration_required" ? "setup" : "failed",
        );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section
      className="mt-4 min-w-0 border-y border-gold/20 py-4"
      aria-label={t("overview.marketValue")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base text-cream">{t("overview.marketValue")}</h2>
          <p className="mt-1 break-words font-display text-2xl text-cream">
            {summary.groups.map((g) => money(g.total, g.currency)).join(" / ") || "—"}
          </p>
        </div>
        {refreshing && progress?.remaining.length ? (
          <button
            className={commandClass}
            disabled={stopping}
            onClick={() => {
              stop.current = true;
              setStopping(true);
            }}
          >
            <Pause className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("prices.stop")}
          </button>
        ) : (
          <button
            className={commandClass}
            disabled={busy || !ready || !active.length}
            onClick={() => refresh(Boolean(progress?.remaining.length))}
          >
            {progress?.remaining.length ? (
              <Play className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            {t(progress?.remaining.length ? "prices.resume" : "overview.updateValues")}
          </button>
        )}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {counts.fresh}/{active.length} {t("prices.coverage")}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{t("overview.marketValueDesc")}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        {(["fresh", "old", "unverified", "missing"] as const).map((status) => (
          <div key={status} className="flex min-w-0 justify-between gap-2">
            <dt className={statusClass[status]}>{t(`prices.${status}`)}</dt>
            <dd className="shrink-0 tabular-nums text-cream">{counts[status]}</dd>
          </div>
        ))}
      </dl>
      {(!ready || failure) && (
        <p role="alert" className="mt-3 text-sm text-amber-200">
          {t(!ready || failure === "setup" ? "prices.setup" : "prices.failed")}
        </p>
      )}
      {progress && (
        <div className="mt-4 text-sm" role="status" aria-live="polite">
          <p>
            {progress.checked}/{progress.total} {t("prices.checked")}
          </p>
          <progress
            aria-label={t("prices.checked")}
            value={progress.checked}
            max={progress.total || 1}
            className="mt-2 h-2 w-full accent-gold"
          />
          <p className="mt-2 text-muted-foreground">
            {progress.review} {t("prices.review")} · {progress.missing} {t("prices.noMatch")} ·{" "}
            {progress.failed} {t("prices.error")} · {progress.skipped} {t("prices.skipped")}
          </p>
          {stopping && <p className="mt-2 text-gold">{t("prices.stopping")}</p>}
        </div>
      )}
      <MobileDetails title={t("prices.details")} className="mt-3">
        <ul className="divide-y divide-white/10">
          {active.map((wine) => (
            <PriceWineRow
              key={`${wine.id}:${wine.updated_at}`}
              wine={wine}
              busy={busy || !ready}
              confirm={confirm}
            />
          ))}
        </ul>
      </MobileDetails>
    </section>
  );
}

function PriceWineRow({
  wine,
  busy,
  confirm,
}: {
  wine: RetailWine;
  busy: boolean;
  confirm: (wineId: string, productNumber: string) => Promise<void>;
}) {
  const t = useT();
  const status = priceFreshness(wine);
  const candidates = priceCandidates(wine);
  const [selected, setSelected] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const picked = candidates.find((c) => c.productNumber === selected);
  const canConfirm = picked && canConfirmPrice(wine, picked);
  return (
    <li className="min-w-0 py-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="break-words text-base text-cream">
            {wine.wine_name || wine.producer || "—"}
          </p>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {wine.producer} · {wine.vintage ?? t("prices.unknownYear")} ·{" "}
            {wine.bottle_ml ? `${wine.bottle_ml} ml` : t("prices.unknownSize")}
          </p>
        </div>
        <Link
          to="/wine/$id/edit"
          params={{ id: wine.id }}
          aria-label={`${t("wine.edit")}: ${wine.wine_name ?? ""}`}
          title={t("wine.edit")}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gold hover:bg-white/5"
        >
          <Pencil className="h-4 w-4" />
        </Link>
      </div>
      <p className="mt-2 text-base text-cream">
        {wine.market_price && wine.market_price_currency
          ? money(wine.market_price, wine.market_price_currency)
          : "—"}{" "}
        <span className={`ml-2 text-sm ${statusClass[status]}`}>{t(`prices.${status}`)}</span>
      </p>
      {date(wine.market_price_checked_at) && (
        <p className="mt-1 text-sm text-muted-foreground">
          {t("overview.lastChecked")}: {date(wine.market_price_checked_at)}
        </p>
      )}
      {date(wine.retail_price_attempted_at) && (
        <p className="mt-1 text-sm text-muted-foreground">
          {t("prices.attempted")}: {date(wine.retail_price_attempted_at)}
        </p>
      )}
      {wine.retail_price_status === "error" && (
        <p className="mt-2 text-sm text-amber-200">{t("prices.error")}</p>
      )}
      {wine.retail_price_status === "missing" && (
        <p className="mt-2 text-sm text-muted-foreground">{t("prices.noMatch")}</p>
      )}
      {candidates.length > 0 && (
        <fieldset className="mt-3 min-w-0 space-y-2 border-t border-white/10 pt-3" disabled={busy}>
          <legend className="text-sm text-gold">{t("prices.review")}</legend>
          {candidates.map((candidate) => {
            const eligible = canConfirmPrice(wine, candidate);
            return (
              <div key={candidate.productNumber} className="min-w-0">
                <label className="flex min-h-11 cursor-pointer items-start gap-2 text-base">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center">
                    <input
                      type="radio"
                      name={`price-${wine.id}`}
                      value={candidate.productNumber}
                      checked={selected === candidate.productNumber}
                      disabled={!eligible}
                      onChange={() => {
                        setSelected(candidate.productNumber);
                        setAcknowledged(false);
                      }}
                      className="h-5 w-5 accent-gold"
                    />
                  </span>
                  <span className="min-w-0 flex-1 break-words pt-2">
                    {candidate.name}
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {candidate.producer} · {candidate.vintage ?? t("prices.unknownYear")} ·{" "}
                      {candidate.volumeMl ? `${candidate.volumeMl} ml` : t("prices.unknownSize")} ·{" "}
                      {money(candidate.price, candidate.currency)} · #{candidate.productNumber}
                    </span>
                  </span>
                </label>
                {!eligible && (
                  <p className="ml-11 text-sm text-amber-200">{t("prices.conflict")}</p>
                )}
                <a
                  href={`https://www.systembolaget.se/produkt/vin/${candidate.productNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-11 inline-flex min-h-11 items-center gap-2 text-sm text-gold"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t("prices.product")}
                </a>
              </div>
            );
          })}
          <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm text-muted-foreground">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center">
              <input
                type="checkbox"
                checked={acknowledged}
                disabled={!canConfirm}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="h-5 w-5 accent-gold"
              />
            </span>
            <span className="pt-2">{t("prices.acknowledge")}</span>
          </label>
          <button
            className={commandClass}
            disabled={!canConfirm || !acknowledged || busy}
            onClick={() => confirm(wine.id, selected)}
          >
            <Check className="h-4 w-4" />
            {t("prices.confirm")}
          </button>
        </fieldset>
      )}
    </li>
  );
}
