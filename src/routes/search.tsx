import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search as SearchIcon, X, Star, Wine, Camera } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Logo } from "@/components/Logo";
import { EmptyState } from "@/components/EmptyState";
import { CellarRowSkeleton } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import { WineImage } from "@/components/WineImage";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/i18n";
import { wineRating, type RatedWine } from "@/lib/wineRatings";
import { readAllPages } from "@/lib/readAllPages";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search — WineSnap" },
      { name: "description", content: "Discover wines by region, varietal, price, and rating." },
    ],
  }),
  component: SearchPage,
});

type WineRow = RatedWine & {
  id: string;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  region: string | null;
  country: string | null;
  image_url: string | null;
  grape_varieties: string[] | null;
  fruit: number | null;
  tannin: number | null;
  acidity: number | null;
  body: number | null;
};

function SearchPage() {
  const t = useT();
  const [q, setQ] = useState("");
  const [wines, setWines] = useState<WineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    let cancelled = false;
    setWines([]);
    setLoadError(false);
    setLoading(true);
    if (authLoading) return;
    readAllPages(
      (from, to) =>
        supabase
          .from("wines")
          .select(
            "id,user_id,producer,wine_name,vintage,region,country,image_url,grape_varieties,fruit,tannin,acidity,body,user_rating,tasting_notes(rating,created_at,user_id)",
          )
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      () => cancelled,
    )
      .then((data) => {
        if (cancelled) return;
        setWines((data as WineRow[]) ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading, revision]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return wines;
    return wines.filter((w) =>
      [w.wine_name, w.producer, w.region, w.country, ...(w.grape_varieties ?? [])]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(term)),
    );
  }, [q, wines]);

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        <header className="flex items-center justify-center">
          <Logo size="md" />
        </header>

        <h1 className="mt-5 text-center font-display text-2xl text-gold">{t("search.title")}</h1>

        <div className="mt-4">
          <div className="relative">
            <SearchIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("search.ph")}
              aria-label={t("search.ph")}
              className="min-h-12 w-full rounded-md border border-white/10 bg-card/60 pl-10 pr-14 text-base text-foreground placeholder:text-muted-foreground focus:border-gold/40 focus:outline-none"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                aria-label={t("common.cancel")}
                className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-baseline justify-between">
          <h2 className="font-display text-xl">{t("search.discover")}</h2>
          <span className="text-sm text-muted-foreground">
            {filtered.length} {t("search.results")}
          </span>
        </div>

        <ul className="mt-3 space-y-3 pb-4">
          {loading ? (
            <>
              <li>
                <CellarRowSkeleton />
              </li>
              <li>
                <CellarRowSkeleton />
              </li>
              <li>
                <CellarRowSkeleton />
              </li>
            </>
          ) : loadError ? (
            <li role="alert">
              {t("common.error")}{" "}
              <Button variant="outline" onClick={() => setRevision((n) => n + 1)}>
                {t("common.retry")}
              </Button>
            </li>
          ) : filtered.length === 0 ? (
            <li>
              <EmptyState
                icon={Wine}
                title={wines.length === 0 ? t("search.empty") : t("search.noMatch")}
                action={
                  wines.length === 0 ? (
                    <Link to="/scan">
                      <Button className="bg-gradient-burgundy text-cream min-h-11">
                        <Camera className="h-5 w-5" /> {t("nav.scan")}
                      </Button>
                    </Link>
                  ) : undefined
                }
              />
            </li>
          ) : (
            filtered.map((w) => <ResultCard key={w.id} w={w} />)
          )}
        </ul>
      </div>
    </AppShell>
  );
}

function ResultCard({ w }: { w: WineRow }) {
  const rating = wineRating(w);
  return (
    <li>
      <Link
        to="/wine/$id"
        params={{ id: w.id }}
        className="flex gap-3 rounded-xl border border-white/8 bg-card/50 p-3 transition-colors hover:bg-card/70"
      >
        <div className="relative flex h-[88px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-b from-burgundy/40 to-background/60">
          {w.image_url ? (
            <WineImage src={w.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Wine className="h-6 w-6 text-gold/60" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words font-display text-xl leading-tight text-cream">
            {w.wine_name ?? w.producer ?? "Unknown"} {w.vintage ?? ""}
          </p>
          <p className="mt-1 break-words text-sm text-gold">
            {[w.region, w.country].filter(Boolean).join(", ")}
          </p>
          <p className="break-words text-sm text-muted-foreground">
            {w.grape_varieties?.join(", ") || "—"}
          </p>
          {rating != null && (
            <div className="mt-1 flex items-center gap-1.5 text-sm">
              <Star className="h-5 w-5 fill-gold text-gold" />
              <span className="font-medium">{rating.toFixed(1)}</span>
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}
