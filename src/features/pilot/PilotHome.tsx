import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ChefHat,
  CookingPot,
  MessageCircleMore,
  Play,
  RefreshCw,
  User,
  Wine,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { WineImage } from "@/components/WineImage";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { wineImageStoragePath } from "@/lib/wineImages";
import { recipeImages } from "../kitchen/catalog";
import { useKitchen } from "../kitchen/useKitchen";
import { chefEnabled } from "../chef/feature";
import { mealsEnabled } from "../meals/feature";
import hero from "@/assets/pilot/food-wine.webp";

type RecentWine = {
  id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: number | null;
  image_url: string | null;
};

export function PilotHome({ owner }: { owner?: string }) {
  const t = useT();
  const kitchen = useKitchen(owner);
  const [online, setOnline] = useState(true);
  const [revision, setRevision] = useState(0);
  const [cellar, setCellar] = useState<{
    owner: string;
    rows: RecentWine[];
    state: "loading" | "ready" | "error";
  } | null>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!owner || !online) {
      setCellar(null);
      return;
    }
    setCellar({ owner, rows: [], state: "loading" });
    void supabase
      .from("wines")
      .select("id,wine_name,producer,vintage,image_url")
      .eq("user_id", owner)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(3)
      .then(
        ({ data, error }) => {
          if (!cancelled)
            setCellar({ owner, rows: error ? [] : (data ?? []), state: error ? "error" : "ready" });
        },
        () => {
          if (!cancelled) setCellar({ owner, rows: [], state: "error" });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [owner, online, revision]);

  const current = online && cellar?.owner === owner ? cellar : null;
  const session = kitchen.cache?.session;
  const active = session && ["running", "paused"].includes(session.state.status) ? session : null;
  const recipe = active?.version.document;

  return (
    <AppShell>
      <div className="pilot-home">
        <header className="pilot-home-header">
          <h1 className="pilot-brand">WineSnap</h1>
          <Link
            to="/me"
            className="pilot-icon"
            aria-label={t("nav.profile")}
            title={t("nav.profile")}
          >
            <User size={24} aria-hidden />
          </Link>
        </header>
        <img
          src={hero}
          alt={t("pilot.heroAlt")}
          className="pilot-hero"
          width={1440}
          height={810}
          fetchPriority="high"
        />

        <div className="pilot-entries">
          <Link to="/kitchen" className="pilot-entry pilot-food">
            <CookingPot size={28} aria-hidden />
            <span>{t("nav.kitchen")}</span>
          </Link>
          <Link to="/cellar" className="pilot-entry pilot-wine">
            <Wine size={28} aria-hidden />
            <span>{t("pilot.cellarEntry")}</span>
          </Link>
        </div>

        <section className="pilot-band" aria-labelledby="pilot-cooking-title">
          <h2 id="pilot-cooking-title">{t(active ? "pilot.resume" : "pilot.recipes")}</h2>
          {active && recipe ? (
            <Link to="/kitchen" hash="cook" className="pilot-resume">
              {recipe.image !== "none" && (
                <img src={recipeImages[recipe.image]} alt="" width={96} height={80} />
              )}
              <span className="pilot-row-copy">
                <strong>{recipe.title}</strong>
                <span>
                  {t("pilot.step")
                    .replace("{current}", String(active.state.activeStep + 1))
                    .replace("{total}", String(recipe.steps.length))}
                </span>
                <progress
                  value={active.state.activeStep + 1}
                  max={recipe.steps.length}
                  aria-label={t("pilot.cookingProgress")}
                />
              </span>
              <Play size={22} aria-hidden />
            </Link>
          ) : (
            <Link to="/kitchen" className="pilot-command">
              <CookingPot size={24} aria-hidden />
              <span>{t("pilot.openRecipes")}</span>
              <ArrowRight size={20} aria-hidden />
            </Link>
          )}
          {kitchen.error && (
            <p className="pilot-status" role="status">
              {t("pilot.kitchenUnavailable")}
            </p>
          )}
        </section>

        <section className="pilot-band" aria-labelledby="pilot-pairing-title">
          <h2 id="pilot-pairing-title">{t("pilot.foodWine")}</h2>
          {mealsEnabled && (
            <Link to="/kitchen" hash="pairings" className="pilot-command">
              <Wine size={24} aria-hidden />
              <span>{t("pilot.chooseWine")}</span>
              <ArrowRight size={20} aria-hidden />
            </Link>
          )}
          <div className="pilot-assistants">
            {chefEnabled && (
              <Link to="/kitchen" hash="chef">
                <ChefHat size={21} aria-hidden />
                <span>{t("pilot.chef")}</span>
              </Link>
            )}
            <Link to="/ask">
              <MessageCircleMore size={21} aria-hidden />
              <span>{t("pilot.sommelier")}</span>
            </Link>
          </div>
        </section>

        <section className="pilot-band" aria-labelledby="pilot-wines-title">
          <div className="pilot-section-heading">
            <h2 id="pilot-wines-title">{t("pilot.recentWines")}</h2>
            <Link
              to="/cellar"
              className="pilot-icon"
              aria-label={t("nav.cellar")}
              title={t("nav.cellar")}
            >
              <ArrowRight size={22} aria-hidden />
            </Link>
          </div>
          {!owner ? (
            <Link to="/login" className="pilot-command">
              <User size={22} aria-hidden />
              <span>{t("pilot.signIn")}</span>
              <ArrowRight size={20} aria-hidden />
            </Link>
          ) : !online ? (
            <p className="pilot-status" role="status">
              {t("pilot.winesOffline")}
            </p>
          ) : current?.state === "error" ? (
            <div role="alert" className="pilot-status">
              {t("common.error")}
              <button
                className="pilot-icon"
                onClick={() => setRevision((n) => n + 1)}
                aria-label={t("collector.retry")}
                title={t("collector.retry")}
              >
                <RefreshCw size={20} />
              </button>
            </div>
          ) : current?.state !== "ready" ? (
            <p className="pilot-status" role="status">
              {t("pilot.loading")}
            </p>
          ) : current.rows.length ? (
            <ul className="pilot-recent-list">
              {current.rows.map((wine) => (
                <li key={wine.id}>
                  <Link to="/wine/$id" params={{ id: wine.id }} className="pilot-recent-wine">
                    <span className="pilot-bottle">
                      <Wine size={22} aria-hidden />
                      <WineImage
                        src={null}
                        storagePath={wineImageStoragePath(wine.image_url)}
                        alt=""
                        loading="lazy"
                      />
                    </span>
                    <span className="pilot-row-copy">
                      <strong>{wine.wine_name || wine.producer || t("pilot.unnamedWine")}</strong>
                      {wine.vintage && <span>{wine.vintage}</span>}
                    </span>
                    <ArrowRight size={20} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Link to="/cellar" className="pilot-command">
              <Wine size={23} aria-hidden />
              <span>{t("pilot.openCellar")}</span>
              <ArrowRight size={20} aria-hidden />
            </Link>
          )}
        </section>
      </div>
    </AppShell>
  );
}
