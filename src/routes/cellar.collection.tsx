import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Plus, Pencil, Save, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import {
  COLLECTOR_CURRENCIES,
  COLLECTOR_PURPOSES,
  collectorLotSchema,
  collectorLotRowSchema,
  collectorTotals,
  type CollectorLot,
} from "@/lib/collectorLots";

// collector_lots is not yet in the generated Database types (table pending in prod).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const collectorLots = () => (supabase as any).from("collector_lots");

export const Route = createFileRoute("/cellar/collection")({
  head: () => ({ meta: [{ title: "Collector Cellar - WineSnap" }] }),
  component: CollectorPage,
});

type Wine = {
  id: string;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  quantity: number | null;
  consumed_at: string | null;
};
const emptyForm = () => ({
  wine_id: "",
  purpose: "collect",
  purchased_at: new Date().toISOString().slice(0, 10),
  quantity: "1",
  remaining: "1",
  bottle_ml: "750",
  unit_cost: "",
  additional_cost: "0",
  currency: "SEK",
  condition: "",
  provenance: "",
  storage: "",
  estimate_price: "",
  estimate_currency: "SEK",
  estimate_date: "",
  estimate_source: "",
  estimate_confidence: "low",
});
type Form = ReturnType<typeof emptyForm>;
const inputClass =
  "h-10 w-full min-w-0 rounded-md border border-white/15 bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold/50";
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
  const t = useT();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
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

  useEffect(() => {
    setForm(null);
    setEditing(null);
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    setLots([]);
    setWines([]);
    setError(null);
    setLoading(Boolean(userId));
    if (!userId) return;
    Promise.all([
      collectorLots()
        .select("*")
        .eq("user_id", userId)
        .order("purchased_at", { ascending: false }),
      supabase
        .from("wines")
        .select("id,producer,wine_name,vintage,quantity,consumed_at")
        .eq("user_id", userId),
    ])
      .then(([lotResult, wineResult]) => {
        if (cancelled) return;
        if (lotResult.error || wineResult.error) {
          const code = lotResult.error?.code;
          setError(code === "42P01" || code === "PGRST205" ? "collector.pending" : "common.error");
        } else {
          setLots((lotResult.data ?? []).map((row) => collectorLotRowSchema.parse(row)));
          setWines(wineResult.data ?? []);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("common.error");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, revision]);

  function edit(lot: CollectorLot) {
    const draft = emptyForm();
    for (const key of Object.keys(draft) as (keyof Form)[])
      draft[key] = lot[key] == null ? "" : String(lot[key]);
    setEditing(lot.id);
    setForm(draft);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || !user || saving) return;
    const hasEstimate = form.estimate_price.trim() !== "";
    const parsed = collectorLotSchema.safeParse({
      ...form,
      quantity: Number(form.quantity || NaN),
      remaining: Number(form.remaining || NaN),
      bottle_ml: Number(form.bottle_ml || NaN),
      unit_cost: Number(form.unit_cost || NaN),
      additional_cost: Number(form.additional_cost || 0),
      estimate_price: hasEstimate ? Number(form.estimate_price) : null,
      estimate_currency: hasEstimate ? form.estimate_currency : null,
      estimate_date: hasEstimate ? form.estimate_date : null,
      estimate_source: hasEstimate ? form.estimate_source : null,
      estimate_confidence: hasEstimate ? form.estimate_confidence : null,
    });
    if (!parsed.success) {
      toast.error(t("collector.invalid"));
      return;
    }
    const wine = wines.find((w) => w.id === parsed.data.wine_id);
    const allocated = lots
      .filter((lot) => lot.wine_id === parsed.data.wine_id && lot.id !== editing)
      .reduce((sum, lot) => sum + lot.remaining, 0);
    const available = wine && !wine.consumed_at ? (wine.quantity ?? 1) : 0;
    if (!wine || allocated + parsed.data.remaining > available) {
      toast.error(t("collector.stockError"));
      return;
    }
    setSaving(true);
    try {
      const result = editing
        ? await collectorLots()
            .update(parsed.data)
            .eq("id", editing)
            .eq("user_id", user.id)
            .select("id")
            .single()
        : await collectorLots()
            .insert({ ...parsed.data, user_id: user.id })
            .select("id")
            .single();
      if (result.error) {
        toast.error(
          t(
            result.error.message.includes("exceeds cellar stock")
              ? "collector.stockError"
              : "common.error",
          ),
        );
        return;
      }
      toast.success(t("common.saved"));
      setForm(null);
      setEditing(null);
      setRevision((n) => n + 1);
    } catch {
      toast.error(t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  const visible = lots.filter(
    (lot) => (showClosed || lot.remaining > 0) && (filter === "all" || lot.purpose === filter),
  );
  const totals = collectorTotals(visible);
  const update = (key: keyof Form, value: string) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));
  function field(key: keyof Form, label: string, type = "text", required = false) {
    return (
      <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
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
      <label className="grid gap-1 text-xs text-muted-foreground">
        <span>{t("collector.currency")}</span>
        <select
          className={inputClass}
          value={form?.[key]}
          onChange={(e) => update(key, e.target.value)}
        >
          {COLLECTOR_CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <AppShell>
      <header className="flex items-center gap-3">
        <Link
          to="/cellar"
          aria-label={t("common.back")}
          className="flex h-9 w-9 shrink-0 items-center justify-center"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="min-w-0 flex-1 font-display text-xl text-gold">{t("collector.title")}</h1>
        {user && !error && !loading && (
          <Button
            size="icon"
            variant="outline"
            title={t("collector.add")}
            aria-label={t("collector.add")}
            disabled={!!form || saving || !wines.length}
            onClick={() => {
              setEditing(null);
              setForm(emptyForm());
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </header>
      {authLoading || loading ? (
        <p role="status" className="py-8 text-center">
          {t("common.loading")}
        </p>
      ) : !user ? (
        <Link to="/login" className="mt-6 block text-center text-gold">
          {t("collector.signIn")}
        </Link>
      ) : error ? (
        <section className="py-6">
          <p role="alert">{t(error)}</p>
          <Button variant="outline" className="mt-3" onClick={() => setRevision((n) => n + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" />
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
                className={`rounded-md border px-3 py-2 text-xs ${filter === purpose ? "border-gold text-gold" : "border-white/15 text-muted-foreground"}`}
              >
                {t(`collector.${purpose}` as "collector.all")}
              </button>
            ))}
          </div>
          {totals.length > 0 && (
            <section className="mb-5 border-y border-white/10 py-4">
              <h2 className="text-sm text-cream">{t("collector.cost")}</h2>
              {totals
                .filter((g) => g.bottles > 0)
                .map((g) => (
                  <p key={g.currency} className="mt-1 break-words font-display text-xl">
                    {money(g.cost, g.currency)}{" "}
                    <span className="font-sans text-xs text-muted-foreground">
                      {g.bottles} {t("overview.bottles")}
                    </span>
                  </p>
                ))}
              <h2 className="mt-4 text-sm text-cream">{t("collector.estimates")}</h2>
              {totals.some((g) => g.valued) ? (
                totals
                  .filter((g) => g.valued > 0)
                  .map((g) => (
                    <p key={g.currency} className="mt-1 break-words font-display text-xl">
                      {money(g.estimate, g.currency)}{" "}
                      <span className="font-sans text-xs text-muted-foreground">
                        {g.valued} {t("overview.bottles")}
                      </span>
                    </p>
                  ))
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">{t("collector.noEstimate")}</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {t("collector.manualDisclaimer")}
              </p>
            </section>
          )}
          {form && (
            <form onSubmit={save} className="mb-6 border-y border-gold/30 py-5">
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
                  onClick={() => setForm(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <fieldset disabled={saving} className="grid min-w-0 gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs text-muted-foreground sm:col-span-2">
                  <span>{t("collector.wine")}</span>
                  <select
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
                <label className="grid gap-1 text-xs text-muted-foreground">
                  <span>{t("collector.purpose")}</span>
                  <select
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
                {field("additional_cost", t("collector.fees"), "number")}
                {field("condition", t("collector.condition"))}
                {field("provenance", t("collector.provenance"))}
                {field("storage", t("collector.storage"))}
              </fieldset>
              <fieldset
                disabled={saving}
                className="mt-5 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2"
              >
                <legend className="text-sm text-gold">{t("collector.estimateOptional")}</legend>
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
                <label className="grid gap-1 text-xs text-muted-foreground">
                  <span>{t("collector.confidence")}</span>
                  <select
                    className={inputClass}
                    value={form.estimate_confidence}
                    onChange={(e) => update("estimate_confidence", e.target.value)}
                  >
                    {["low", "medium", "high"].map((c) => (
                      <option key={c} value={c}>
                        {t(`collector.${c}` as "collector.low")}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
              <Button type="submit" disabled={saving} className="mt-4">
                <Save className="mr-2 h-4 w-4" />
                {t(saving ? "common.loading" : "common.save")}
              </Button>
            </form>
          )}
          <label className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
            />
            {t("collector.showClosed")}
          </label>
          {!visible.length && (
            <p className="py-6 text-sm text-muted-foreground">{t("collector.empty")}</p>
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
                    <p className="mt-1 text-xs text-muted-foreground">
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
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-2 text-sm">
                  {t("collector.unitCost")}: {money(lot.unit_cost, lot.currency)}
                </p>
                {lot.additional_cost > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("collector.fees")}: {money(lot.additional_cost, lot.currency)}
                  </p>
                )}
                {[lot.condition, lot.provenance, lot.storage].some(Boolean) && (
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    {(["condition", "provenance", "storage"] as const).map((key) =>
                      lot[key] ? (
                        <div key={key} className="contents">
                          <dt className="text-muted-foreground">{t(`collector.${key}`)}</dt>
                          <dd className="break-words">{lot[key]}</dd>
                        </div>
                      ) : null,
                    )}
                  </dl>
                )}
                {lot.estimate_price !== null && lot.estimate_currency && (
                  <div className="mt-3 border-l-2 border-gold/40 pl-3">
                    <p className="text-sm">
                      {t("collector.estimateUnit")}:{" "}
                      {money(lot.estimate_price, lot.estimate_currency)}
                    </p>
                    <p className="break-words text-xs text-muted-foreground">
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
