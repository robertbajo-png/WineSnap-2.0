import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Wine, ArrowRight } from "lucide-react";
import { loadPublicWine, type PublicWine } from "@/lib/publicWine";
import { WineImage } from "@/components/WineImage";
import { BarMeter } from "@/components/MeterRow";

export const Route = createFileRoute("/w/$shareId")({
  head: () => ({
    meta: [
      { title: "Shared Wine — WineSnap" },
      { name: "description", content: "A wine shared from a WineSnap cellar." },
      { property: "og:title", content: "Shared Wine — WineSnap" },
      { property: "og:type", content: "article" },
    ],
  }),
  component: PublicWinePage,
});

function PublicWinePage() {
  const { shareId } = Route.useParams();
  const [w, setW] = useState<PublicWine | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await loadPublicWine(shareId);
      if (!data) setNotFound(true);
      else setW(data as PublicWine);
      setLoading(false);
    })();
  }, [shareId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-pulse rounded-full bg-burgundy/40" />
      </div>
    );
  }

  if (notFound || !w) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <Wine className="h-10 w-10 text-gold" />
        <div>
          <h1 className="font-display text-xl text-cream">Not available</h1>
          <p className="mt-1 text-base text-muted-foreground">
            This share link is invalid or the wine is no longer public.
          </p>
        </div>
        <Link
          to="/"
          className="mt-2 inline-flex items-center gap-2 rounded-full bg-gradient-burgundy px-4 py-2 text-base text-cream shadow-elegant"
        >
          Explore WineSnap <ArrowRight className="h-5 w-5" />
        </Link>
      </div>
    );
  }

  const meters: Array<[string, number | null]> = [
    ["Body", w.body],
    ["Tannin", w.tannin],
    ["Acidity", w.acidity],
    ["Fruit", w.fruit],
    ["Oak", w.oak],
    ["Sweetness", w.sweetness],
  ];

  return (
    <div className="min-h-screen bg-background px-5 pt-6 pb-16">
      <header className="mx-auto flex max-w-md items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-display text-lg text-gold">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-gold/40 text-base">
            W
          </span>
          WineSnap
        </Link>
        <span className="text-sm uppercase tracking-widest text-muted-foreground">Shared</span>
      </header>

      <div className="mx-auto mt-6 max-w-md">
        {w.image_url && (
          <div className="overflow-hidden rounded-3xl border border-white/10 shadow-elegant">
            <WineImage
              src={w.image_url}
              alt={w.wine_name ?? "Wine"}
              className="w-full object-cover"
            />
          </div>
        )}

        <div className="mt-5 text-center">
          {w.producer && (
            <p className="text-sm uppercase tracking-widest text-muted-foreground">{w.producer}</p>
          )}
          <h1 className="mt-1 font-display text-2xl text-cream">
            {w.wine_name ?? "Untitled"} {w.vintage ?? ""}
          </h1>
          <p className="mt-1 text-sm text-foreground/70">
            {[w.region, w.country].filter(Boolean).join(" · ")}
          </p>
          {w.wine_type && (
            <span className="mt-3 inline-block rounded-full border border-white/10 bg-card/60 px-3 py-1 text-sm uppercase tracking-wider text-gold">
              {w.wine_type}
            </span>
          )}
        </div>

        {w.description && (
          <p className="mt-5 text-center text-base leading-relaxed text-foreground/80">
            {w.description}
          </p>
        )}

        {meters.some(([, v]) => v != null) && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-card/40 p-4">
            <h2 className="text-center font-display text-base uppercase tracking-widest text-gold">
              Profile
            </h2>
            <div className="mt-3 space-y-2">
              {meters.map(([label, val]) => (
                <BarMeter key={label} label={label} value={val} max={10} />
              ))}
            </div>
          </div>
        )}

        {(w.primary_notes?.length || w.secondary_notes?.length) && (
          <div className="mt-6">
            <h2 className="text-center font-display text-base uppercase tracking-widest text-gold">
              Aromas
            </h2>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {[
                ...(w.primary_notes ?? []),
                ...(w.secondary_notes ?? []),
                ...(w.tertiary_notes ?? []),
              ]
                .slice(0, 12)
                .map((a) => (
                  <span
                    key={a}
                    className="rounded-full border border-white/10 bg-card/60 px-3 py-1 text-sm text-foreground/85"
                  >
                    {a}
                  </span>
                ))}
            </div>
          </div>
        )}

        <div className="mt-10 rounded-2xl border border-gold/20 bg-gradient-to-br from-burgundy/20 to-transparent p-5 text-center">
          <p className="font-display text-cream">Build your own cellar</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Scan wines, track tastings, and get AI picks tuned to you.
          </p>
          <Link
            to="/"
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-burgundy px-4 py-2 text-base text-cream shadow-elegant"
          >
            Open WineSnap <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
