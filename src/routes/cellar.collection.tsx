import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Plus, Pencil, Save, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { MobileDetails } from "@/components/MobileDetails";
import { CollectorSelect } from "@/components/CollectorSelect";
import { revealInvalidField } from "@/lib/mobileForms";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/i18n";
import { OperationNotice } from "@/components/OperationNotice";
import {
  createCollectorAttempt,
  loadCollectorAccount,
  saveCollectorAttempt,
  CollectorStoreError,
  type CollectorSaveAttempt,
  type CollectorWine,
} from "@/lib/collectorStore";
import {
  COLLECTOR_CURRENCIES,
  COLLECTOR_PURPOSES,
  collectorForm,
  parseCollectorForm,
  collectorTotals,
  type CollectorLot,
} from "@/lib/collectorLots";

export const Route = createFileRoute("/cellar/collection")({
  head: () => ({ meta: [{ title: "Collector Cellar - WineSnap" }] }),
  component: CollectorPage,
});

type Wine = CollectorWine;
const emptyForm = () => collectorForm();
type Form = ReturnType<typeof emptyForm>;
const inputClass =
  "h-12 min-h-12 w-full min-w-0 rounded-md border border-white/15 bg-card px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-gold/50";
function money(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}
function wineName(wine?: Wine) {
  return wine ? [wine.producer, wine.wine_name, wine.vintage].filter(Boolean).join(" ") : "";
}

function CollectorPage() {
  const { user, loading } = useAuth();
  return <CollectorAccount key={user?.id ?? "signed-out"} owner={user?.id} authLoading={loading} />;
}

function CollectorAccount({ owner, authLoading }: { owner?: string; authLoading: boolean }) {
  const t = useT();
  const userId = owner;
  const [lots, setLots] = useState<CollectorLot[]>([]);
  const [wines, setWines] = useState<Wine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"common.error" | "collector.pending" | null>(null);
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState("all");
  const [showClosed, setShowClosed] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveIssue, setSaveIssue] = useState<
    "uncertain" | "conflict" | "stock" | "unavailable" | null
  >(null);
  const live = useRef(true),
    write = useRef<AbortController | null>(null);
  const attempt = useRef<CollectorSaveAttempt | null>(null);
  const original = useRef<CollectorLot | null>(null);
  const blocked = saving || saveIssue === "uncertain" || saveIssue === "conflict";

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      write.current?.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const current = () => live.current && !controller.signal.aborted;
    setLots([]);
    setWines([]);
    setError(null);
    setLoading(Boolean(userId));
    if (!userId) return;
    loadCollectorAccount({ owner: userId, current }, controller.signal)
      .then((data) => {
        if (!current()) return;
        setLots(data.lots);
        setWines(data.wines);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (current()) {
          const code = cause && typeof cause === "object" && "code" in cause ? cause.code : null;
          setError(code === "42P01" || code === "PGRST205" ? "collector.pending" : "common.error");
          setLoading(false);
        }
      });
    return () => {
      controller.abort();
    };
  }, [userId, revision]);

  function edit(lot: CollectorLot) {
    if (write.current) return;
    original.current = lot;
    attempt.current = null;
    setSaveIssue(null);
    setEditing(lot.id);
    setForm(collectorForm(lot));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || !owner || write.current || saveIssue === "conflict") return;
    const parsed = parseCollectorForm(form);
    if (!parsed.success) {
      toast.error(t("collector.invalid"));
      return;
    }
    const wine = wines.find((w) => w.id === parsed.data.wine_id);
    const allocated = lots
      .filter((lot) => lot.wine_id === parsed.data.wine_id && lot.id !== editing)
      .reduce((sum, lot) => sum + lot.remaining, 0);
    const available = wine && !wine.consumed_at ? (wine.quantity ?? 1) : 0;
    if (!attempt.current?.started && (!wine || allocated + parsed.data.remaining > available)) {
      toast.error(t("collector.stockError"));
      return;
    }
    const controller = new AbortController();
    write.current = controller;
    const scope = {
      owner,
      current: () => live.current && write.current === controller && !controller.signal.aborted,
    };
    setSaving(true);
    setSaveIssue(null);
    try {
      attempt.current ??= createCollectorAttempt(owner, parsed.data, original.current);
      await saveCollectorAttempt(attempt.current, scope, controller.signal);
      if (!scope.current()) return;
      toast.success(t("common.saved"));
      attempt.current = null;
      original.current = null;
      setForm(null);
      setEditing(null);
      setRevision((n) => n + 1);
    } catch (cause) {
      if (!scope.current()) return;
      const kind =
        cause instanceof CollectorStoreError
          ? cause.kind
          : attempt.current?.started
            ? "uncertain"
            : "unavailable";
      setSaveIssue(kind === "changed" ? "unavailable" : kind);
    } finally {
      if (scope.current()) {
        write.current = null;
        setSaving(false);
      }
    }
  }

  const visible = lots.filter(
    (lot) => (showClosed || lot.remaining > 0) && (filter === "all" || lot.purpose === filter),
  );
  const totals = collectorTotals(visible);
  const update = (key: keyof Form, value: string) => {
    if (blocked || write.current) return;
    attempt.current = null;
    setSaveIssue(null);
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };
  function closeForm() {
    if (write.current) return;
    if (saveIssue === "uncertain" && !window.confirm(t("collector.uncertainLeave"))) return;
    attempt.current = null;
    original.current = null;
    setSaveIssue(null);
    setForm(null);
    setEditing(null);
    setRevision((n) => n + 1);
  }
  function field(key: keyof Form, label: string, type = "text", required = false) {
    return (
      <label className="grid min-w-0 gap-1 text-sm text-muted-foreground">
        <span>{label}</span>
        <input
          className={inputClass}
          type={type}
          value={form?.[key] ?? ""}
          onChange={(e) => update(key, e.target.value)}
          required={required}
          {...(type === "number"
            ? {
                min: 0,
                step:
                  key === "unit_cost" || key === "additional_cost" || key === "estimate_price"
                    ? "0.01"
                    : "1",
              }
            : { maxLength: 1000 })}
        />
      </label>
    );
  }
  function currencySelect(key: "currency" | "estimate_currency") {
    return (
      <CollectorSelect
        label={t("collector.currency")}
        className={inputClass}
        value={form?.[key] ?? "SEK"}
        onChange={(value) => update(key, value)}
        options={COLLECTOR_CURRENCIES.map((value) => ({ value, label: value }))}
      />
    );
  }

  return (
    <AppShell>
      <header className="flex items-center gap-3">
        <Link
          to="/cellar"
          aria-label={t("common.back")}
          className="flex h-11 w-11 shrink-0 items-center justify-center min-h-11"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="min-w-0 flex-1 font-display text-xl text-gold">{t("collector.title")}</h1>
        {owner && !error && !loading && (
          <Button
            size="icon"
            variant="outline"
            title={t("collector.add")}
            aria-label={t("collector.add")}
            disabled={!!form || saving || !wines.length}
            onClick={() => {
              setEditing(null);
              original.current = null;
              attempt.current = null;
              setSaveIssue(null);
              setForm(emptyForm());
            }}
          >
            <Plus className="h-5 w-5" />
          </Button>
        )}
      </header>
      {authLoading || loading ? (
        <p role="status" className="py-8 text-center">
          {t("common.loading")}
        </p>
      ) : !owner ? (
        <Link to="/login" className="mt-6 block text-center text-gold">
          {t("collector.signIn")}
        </Link>
      ) : error ? (
        <section className="py-6">
          <p role="alert">{t(error)}</p>
          <Button
            variant="outline"
            className="mt-3 min-h-11"
            onClick={() => setRevision((n) => n + 1)}
          >
            <RefreshCw className="mr-2 h-5 w-5" />
            {t("collector.retry")}
          </Button>
        </section>
      ) : (
        <>
          <div
            className="my-5 flex flex-wrap gap-2"
            role="group"
            aria-label={t("collector.purpose")}
          >
            {["all", ...COLLECTOR_PURPOSES].map((purpose) => (
              <button
                key={purpose}
                aria-pressed={filter === purpose}
                onClick={() => setFilter(purpose)}
                className={`rounded-md border px-3 py-2 text-sm  min-h-11 min-w-11 ${filter === purpose ? "border-gold text-gold min-h-11 min-w-11" : "border-white/15 text-muted-foreground"}`}
              >
                {t(`collector.${purpose}` as "collector.all")}
              </button>
            ))}
          </div>
          {totals.length > 0 && (
            <section className="mb-5 border-y border-white/10 py-4">
              <h2 className="text-base text-cream">{t("collector.cost")}</h2>
              {totals
                .filter((g) => g.bottles > 0)
                .map((g) => (
                  <p key={g.currency} className="mt-1 break-words font-display text-xl">
                    {money(g.cost, g.currency)}{" "}
                    <span className="font-sans text-sm text-muted-foreground">
                      {g.bottles} {t("overview.bottles")}
                    </span>
                  </p>
                ))}
              <h2 className="mt-4 text-base text-cream">{t("collector.estimates")}</h2>
              {totals.some((g) => g.valued) ? (
                totals
                  .filter((g) => g.valued > 0)
                  .map((g) => (
                    <p key={g.currency} className="mt-1 break-words font-display text-xl">
                      {money(g.estimate, g.currency)}{" "}
                      <span className="font-sans text-sm text-muted-foreground">
                        {g.valued} {t("overview.bottles")}
                      </span>
                    </p>
                  ))
              ) : (
                <p className="mt-1 text-base text-muted-foreground">{t("collector.noEstimate")}</p>
              )}
              <p className="mt-2 text-sm text-muted-foreground">
                {t("collector.manualDisclaimer")}
              </p>
            </section>
          )}
          {form && (
            <form
              onSubmit={save}
              onInvalidCapture={(event) => revealInvalidField(event.target)}
              className="mb-6 border-y border-gold/30 py-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg">
                  {t(editing ? "collector.edit" : "collector.add")}
                </h2>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("common.cancel")}
                  disabled={saving}
                  onClick={closeForm}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              {saveIssue && (
                <OperationNotice
                  kind="error"
                  action={
                    saveIssue === "conflict"
                      ? { label: t("collector.reload"), onClick: closeForm }
                      : undefined
                  }
                >
                  {t(
                    saveIssue === "uncertain"
                      ? "collector.uncertain"
                      : saveIssue === "conflict"
                        ? "collector.changed"
                        : saveIssue === "stock"
                          ? "collector.stockError"
                          : "common.error",
                  )}
                </OperationNotice>
              )}
              <fieldset disabled={blocked} className="grid min-w-0 gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm text-muted-foreground sm:col-span-2">
                  <span>{t("collector.wine")}</span>
                  <select
                    aria-label={t("collector.wine")}
                    className={inputClass}
                    required
                    disabled={!!editing}
                    value={form.wine_id}
                    onChange={(e) => update("wine_id", e.target.value)}
                  >
                    <option value="">{t("collector.selectWine")}</option>
                    {wines
                      .filter((w) => w.id === form.wine_id || !w.consumed_at)
                      .map((w) => (
                        <option key={w.id} value={w.id}>
                          {wineName(w)}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm text-muted-foreground">
                  <span>{t("collector.purpose")}</span>
                  <select
                    aria-label={t("collector.purpose")}
                    className={inputClass}
                    value={form.purpose}
                    onChange={(e) => update("purpose", e.target.value)}
                  >
                    {COLLECTOR_PURPOSES.map((p) => (
                      <option key={p} value={p}>
                        {t(`collector.${p}` as "collector.drink")}
                      </option>
                    ))}
                  </select>
                </label>
                {field("purchased_at", t("collector.date"), "date", true)}
                {field("quantity", t("collector.quantity"), "number", true)}
                {field("remaining", t("collector.remaining"), "number", true)}
                {field("bottle_ml", t("collector.volume"), "number", true)}
                {currencySelect("currency")}
                {field("unit_cost", t("collector.unitCost"), "number", true)}
              </fieldset>
              <MobileDetails title={t("collector.details")} className="mt-4">
                <fieldset disabled={blocked} className="grid min-w-0 gap-3 sm:grid-cols-2">
                  {field("additional_cost", t("collector.fees"), "number")}
                  {field("condition", t("collector.condition"))}
                  {field("provenance", t("collector.provenance"))}
                  {field("storage", t("collector.storage"))}
                </fieldset>
              </MobileDetails>
              <MobileDetails
                title={t("collector.estimateOptional")}
                defaultOpen={!!form.estimate_price}
                className="mt-4"
              >
                <fieldset disabled={blocked} className="grid min-w-0 gap-3 sm:grid-cols-2">
                  {field("estimate_price", t("collector.estimateUnit"), "number")}
                  {currencySelect("estimate_currency")}
                  {field(
                    "estimate_date",
                    t("collector.estimateDate"),
                    "date",
                    form.estimate_price !== "",
                  )}
                  {field(
                    "estimate_source",
                    t("collector.source"),
                    "text",
                    form.estimate_price !== "",
                  )}
                  <CollectorSelect
                    label={t("collector.confidence")}
                    className={inputClass}
                    value={form.estimate_confidence}
                    onChange={(value) => update("estimate_confidence", value)}
                    options={["low", "medium", "high"].map((value) => ({
                      value,
                      label: t(`collector.${value}` as "collector.low"),
                    }))}
                  />
                </fieldset>
              </MobileDetails>
              <Button
                type="submit"
                disabled={saving || saveIssue === "conflict"}
                className="mt-4 min-h-11"
              >
                <Save className="mr-2 h-5 w-5" />
                {t(saving ? "common.loading" : "common.save")}
              </Button>
            </form>
          )}
          <label className="mb-3 flex min-h-11 items-center gap-3 text-base text-muted-foreground">
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-gold"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
            />
            {t("collector.showClosed")}
          </label>
          {!visible.length && (
            <p className="py-6 text-base text-muted-foreground">{t("collector.empty")}</p>
          )}
          <ul className="divide-y divide-white/10">
            {visible.map((lot) => (
              <li key={lot.id} className="py-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/wine/$id"
                      params={{ id: lot.wine_id }}
                      className="break-words font-display text-lg text-cream"
                    >
                      {wineName(wines.find((w) => w.id === lot.wine_id))}
                    </Link>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t(`collector.${lot.purpose}` as "collector.drink")} · {lot.remaining}/
                      {lot.quantity} · {lot.bottle_ml} ml · {lot.purchased_at}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={!!form || saving}
                    title={t("collector.edit")}
                    aria-label={t("collector.edit")}
                    onClick={() => edit(lot)}
                  >
                    <Pencil className="h-5 w-5" />
                  </Button>
                </div>
                <p className="mt-2 text-base">
                  {t("collector.unitCost")}: {money(lot.unit_cost, lot.currency)}
                </p>
                {lot.additional_cost > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("collector.fees")}: {money(lot.additional_cost, lot.currency)}
                  </p>
                )}
                {[lot.condition, lot.provenance, lot.storage].some(Boolean) && (
                  <MobileDetails title={t("collector.details")} className="mt-3">
                    <dl className="grid gap-2 text-sm">
                      {(["condition", "provenance", "storage"] as const).map((key) =>
                        lot[key] ? (
                          <div key={key}>
                            <dt className="text-muted-foreground">{t(`collector.${key}`)}</dt>
                            <dd className="break-words">{lot[key]}</dd>
                          </div>
                        ) : null,
                      )}
                    </dl>
                  </MobileDetails>
                )}
                {lot.estimate_price !== null && lot.estimate_currency && (
                  <div className="mt-3 border-l-2 border-gold/40 pl-3">
                    <p className="text-base">
                      {t("collector.estimateUnit")}:{" "}
                      {money(lot.estimate_price, lot.estimate_currency)}
                    </p>
                    <p className="break-words text-sm text-muted-foreground">
                      {lot.estimate_date} · {lot.estimate_source} ·{" "}
                      {lot.estimate_confidence && t(`collector.${lot.estimate_confidence}`)}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </AppShell>
  );
}
