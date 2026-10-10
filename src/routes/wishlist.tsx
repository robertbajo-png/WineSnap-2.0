import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import {
  Bookmark,
  Trash2,
  Wine,
  Plus,
  Bell,
  BellOff,
  Tag,
  TrendingDown,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { WineImage } from "@/components/WineImage";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/i18n";
import { toast } from "sonner";
import { wishlistPriceResponse, verifiedWishlistQuote } from "@/lib/wishlistPriceContract";

export const Route = createFileRoute("/wishlist")({
  head: () => ({ meta: [{ title: "Wishlist — WineSnap" }] }),
  component: WishlistPage,
});

type Row = {
  id: string;
  wine_id: string | null;
  bottle_ml: number | null;
  price_source: string | null;
  last_checked_currency: string | null;
  retail_price_match: unknown;
  producer: string | null;
  wine_name: string;
  vintage: number | null;
  region: string | null;
  country: string | null;
  wine_type: string | null;
  grape_varieties: string[] | null;
  image_url: string | null;
  target_price: number | null;
  price_currency: string | null;
  notify_on_drop: boolean;
  notes: string | null;
  source: string;
  created_at: string;
  last_checked_price: number | null;
  last_checked_at: string | null;
  systembolaget_url: string | null;
  price_alert_triggered_at: string | null;
  price_alert_seen_at: string | null;
};

function WishlistPage() {
  const { user, loading } = useAuth();
  const t = useT();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const owner = useRef(user?.id);
  owner.current = user?.id;

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setLoadError(false);
    if (!user) return;
    supabase
      .from("wishlist")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!cancelled) {
          setLoadError(Boolean(error));
          setRows((data ?? []) as unknown as Row[]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, revision]);

  const checkNow = async () => {
    const userId = user?.id;
    if (!userId) return;
    setChecking(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("No session");
      const json = { checked: 0, triggered: 0, failed: 0, unmatched: 0 };
      const ids = (rows ?? []).map((row) => row.id);
      for (let from = 0; from < ids.length; from += 3) {
        if (owner.current !== userId) return;
        const res = await fetch("/api/public/hooks/refresh-wishlist-prices", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ids: ids.slice(from, from + 3) }),
          signal: AbortSignal.timeout(25000),
        });
        if (!res.ok || !res.headers.get("content-type")?.includes("application/json"))
          throw new Error("Price service unavailable");
        const batch = wishlistPriceResponse.parse(await res.json());
        json.checked += batch.checked;
        json.triggered += batch.triggered;
        json.failed += batch.failed + batch.remaining;
        json.unmatched += batch.unmatched;
      }
      if (owner.current !== userId) return;
      if (json.failed) toast.error(`${t("common.error")} (${json.failed})`);
      if (json.unmatched) toast.info(`${t("prices.missing")}: ${json.unmatched}`);
      if (!json.failed)
        toast.success(
          `${t("wishlist.checkedToast")} ${json.checked ?? 0} · ${t("wishlist.alertsToast")} ${json.triggered ?? 0}`,
        );
      setRevision((n) => n + 1);
    } catch {
      toast.error(t("common.error"));
    } finally {
      setChecking(false);
    }
  };

  const setBottleSize = async (r: Row, raw: string) => {
    if (!user) return;
    const bottle_ml = raw === "" ? null : Number(raw);
    if (
      bottle_ml !== null &&
      (!Number.isInteger(bottle_ml) || bottle_ml < 50 || bottle_ml > 30000)
    ) {
      toast.error(t("common.error"));
      return;
    }
    if (bottle_ml === r.bottle_ml) return;
    const patch = {
      bottle_ml,
      retail_price_match: null,
      last_checked_currency: null,
      last_checked_price: null,
      last_checked_at: null,
      systembolaget_id: null,
      systembolaget_url: null,
      price_source: null,
      price_alert_triggered_at: null,
      price_alert_seen_at: null,
    };
    const { error } = await supabase
      .from("wishlist")
      .update(patch as never)
      .eq("id", r.id)
      .eq("user_id", user.id);
    if (error) {
      toast.error(t("common.error"));
      return;
    }
    setRows((rs) => rs?.map((x) => (x.id === r.id ? { ...x, ...patch } : x)) ?? null);
  };

  const markSeen = async (r: Row) => {
    if (
      !user ||
      !r.price_alert_triggered_at ||
      (r.price_alert_seen_at && r.price_alert_seen_at >= r.price_alert_triggered_at)
    )
      return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("wishlist")
      .update({ price_alert_seen_at: now })
      .eq("id", r.id)
      .eq("user_id", user.id);
    if (error) {
      toast.error(t("common.error"));
      return;
    }
    setRows(
      (rs) => rs?.map((x) => (x.id === r.id ? { ...x, price_alert_seen_at: now } : x)) ?? null,
    );
  };

  const remove = async (id: string) => {
    if (!user || !window.confirm(t("wishlist.confirmRemove"))) return;
    const { error } = await supabase.from("wishlist").delete().eq("id", id).eq("user_id", user.id);
    if (error) {
      toast.error(t("common.error"));
      return;
    }
    setRows((r) => r?.filter((x) => x.id !== id) ?? null);
  };

  const toggleNotify = async (r: Row) => {
    if (!user) return;
    const next = !r.notify_on_drop;
    const { error } = await supabase
      .from("wishlist")
      .update({ notify_on_drop: next })
      .eq("id", r.id)
      .eq("user_id", user.id);
    if (error) {
      toast.error(t("common.error"));
      return;
    }
    setRows((rs) => rs?.map((x) => (x.id === r.id ? { ...x, notify_on_drop: next } : x)) ?? null);
  };

  const setTargetPrice = async (r: Row) => {
    if (!user) return;
    const current =
      r.price_currency === "SEK" && r.target_price != null ? String(r.target_price) : "";
    const input = window.prompt(`${t("wishlist.setTargetPrompt")} (SEK)`, current);
    if (input === null) return;
    const n = input.trim() === "" ? null : Number(input.replace(",", "."));
    if (n !== null && (!Number.isFinite(n) || n <= 0)) {
      toast.error(t("common.error"));
      return;
    }
    const { error } = await supabase
      .from("wishlist")
      .update({ target_price: n, price_currency: "SEK" })
      .eq("id", r.id)
      .eq("user_id", user.id);
    if (error) {
      toast.error(t("common.error"));
      return;
    }
    setRows(
      (rs) =>
        rs?.map((x) => (x.id === r.id ? { ...x, target_price: n, price_currency: "SEK" } : x)) ??
        null,
    );
  };

  if (loading || (user && rows === null)) {
    return (
      <AppShell>
        <div className="-mx-5 -mt-6 px-5 pt-3">
          <Header title={t("wishlist.title")} />
          <div className="mt-6 space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell>
        <div className="mt-20 text-center">
          <p className="text-muted-foreground">{t("wishlist.signIn")}</p>
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
        <Header title={t("wishlist.title")} />
        <div className="mt-1 flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t("wishlist.subtitle")}</p>
          {!loadError && rows?.length ? (
            <button
              onClick={checkNow}
              disabled={checking}
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-gold/40 bg-background/60 px-3 text-sm text-gold disabled:opacity-50 min-h-11 min-w-11"
            >
              {checking ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <RefreshCw className="h-5 w-5" />
              )}
              {checking ? t("wishlist.checking") : t("wishlist.checkNow")}
            </button>
          ) : null}
        </div>
        {loadError && (
          <p role="alert" className="my-4">
            {t("common.error")}{" "}
            <Button variant="outline" onClick={() => setRevision((n) => n + 1)}>
              {t("common.retry")}
            </Button>
          </p>
        )}
        {rows?.length ? (
          <p className="mt-1 text-xs text-muted-foreground/70">{t("wishlist.autoNote")}</p>
        ) : null}

        {loadError ? null : !rows?.length ? (
          <EmptyState
            icon={Bookmark}
            title={t("wishlist.emptyTitle")}
            description={t("wishlist.emptyDesc")}
            action={
              <Link to="/for-you">
                <Button className="bg-gradient-burgundy text-cream min-h-11">
                  <Plus className="h-5 w-5" /> {t("wishlist.discover")}
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="mt-5 space-y-3 pb-4">
            {rows?.map((r) => (
              <article
                key={r.id}
                onClick={() => markSeen(r)}
                className={`rounded-xl border p-3 ${
                  verifiedWishlistQuote(r) && r.price_alert_triggered_at && !r.price_alert_seen_at
                    ? "border-success/60 bg-success/5"
                    : "border-white/8 bg-card/50"
                }`}
              >
                {verifiedWishlistQuote(r) &&
                  r.price_currency === "SEK" &&
                  r.price_alert_triggered_at &&
                  !r.price_alert_seen_at && (
                    <div className="mb-2 flex items-center gap-1.5 rounded-md bg-success/15 px-2 py-1 text-sm font-medium text-success">
                      <TrendingDown className="h-3 w-3" />
                      {t("wishlist.priceDropped")}
                      {r.last_checked_price != null && r.target_price != null && (
                        <span className="ml-auto opacity-80">
                          {r.price_currency ?? "kr"} {r.last_checked_price} ≤ {r.target_price}
                        </span>
                      )}
                    </div>
                  )}
                <div className="flex gap-3">
                  <div className="flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-b from-burgundy/40 to-background/60">
                    {r.image_url ? (
                      <WineImage src={r.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Wine className="h-6 w-6 text-gold/60" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 break-words font-display text-xl leading-tight text-cream">
                      {r.producer ? `${r.producer} — ` : ""}
                      {r.wine_name} {r.vintage ?? ""}
                    </p>
                    <p className="mt-0.5 text-sm text-gold">
                      {[r.region, r.country].filter(Boolean).join(", ")}
                      {r.wine_type ? ` • ${r.wine_type}` : ""}
                    </p>
                    {r.grape_varieties?.length ? (
                      <p className="mt-0.5 break-words text-sm text-muted-foreground">
                        {r.grape_varieties.join(", ")}
                      </p>
                    ) : null}
                    {r.last_checked_price != null && (
                      <p className="mt-1 text-base text-cream">
                        {verifiedWishlistQuote(r)
                          ? t("wishlist.lastChecked")
                          : t("prices.unverified")}
                        : {r.last_checked_currency ?? r.price_currency ?? "kr"}{" "}
                        {r.last_checked_price}
                        {r.last_checked_at && (
                          <span className="block text-sm text-muted-foreground">
                            {" "}
                            · {new Date(r.last_checked_at).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        {t("wishlist.bottleSize")}
                        <input
                          key={`${r.id}-${r.bottle_ml}`}
                          type="number"
                          min={50}
                          max={30000}
                          step={1}
                          defaultValue={r.bottle_ml ?? ""}
                          placeholder="ml"
                          aria-label={t("wishlist.bottleSize")}
                          disabled={checking}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(e) => void setBottleSize(r, e.target.value)}
                          className="min-h-11 w-24 rounded-md border border-white/15 bg-background px-2 text-base"
                        />
                      </label>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTargetPrice(r);
                        }}
                        className="flex items-center gap-1 rounded-md border border-gold/30 bg-background/40 px-2 py-1 text-sm text-gold hover:bg-background/70 min-h-11 min-w-11"
                      >
                        <Tag className="h-5 w-5" />
                        {r.target_price != null
                          ? `${r.price_currency ?? "kr"} ${r.target_price}`
                          : t("wishlist.setTarget")}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleNotify(r);
                        }}
                        className={`flex items-center gap-1 rounded-md border px-2 py-1 text-sm  min-h-11 min-w-11 ${
                          r.notify_on_drop
                            ? "border-success/40 bg-success/10 text-success min-h-11 min-w-11"
                            : "border-white/10 bg-background/40 text-muted-foreground"
                        }`}
                      >
                        {r.notify_on_drop ? (
                          <Bell className="h-5 w-5" />
                        ) : (
                          <BellOff className="h-5 w-5" />
                        )}
                        {r.notify_on_drop ? t("wishlist.alertOn") : t("wishlist.alertOff")}
                      </button>
                      {r.systembolaget_url && (
                        <a
                          href={r.systembolaget_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex min-h-11 items-center text-sm text-gold hover:underline"
                        >
                          {t("wishlist.viewAtSb")}
                        </a>
                      )}
                      {r.wine_id && (
                        <Link
                          to="/wine/$id"
                          params={{ id: r.wine_id }}
                          className="inline-flex min-h-11 items-center text-sm text-gold hover:underline"
                        >
                          {t("wishlist.view")}
                        </Link>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(r.id);
                    }}
                    aria-label={t("common.delete")}
                    className="h-11 w-11 shrink-0 rounded-full text-muted-foreground hover:bg-white/5 hover:text-destructive min-h-11 min-w-11"
                  >
                    <Trash2 className="mx-auto h-5 w-5" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Header({ title }: { title: string }) {
  return (
    <header className="flex items-center justify-between">
      <span className="h-9 w-9" />
      <h1 className="font-display text-2xl text-gold">{title}</h1>
      <span className="h-9 w-9" />
    </header>
  );
}
