import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, CookingPot, Utensils } from "lucide-react";
import { useT } from "@/i18n";
import { pilotUiEnabled } from "../pilot/feature";
import { mealsEnabled } from "./feature";
import { kitchenJourneyHash, readWineJourney } from "../kitchen/journey";

export function WineKitchenJourney({
  wineId,
  wineOwner,
  viewer,
}: {
  wineId: string;
  wineOwner: string;
  viewer?: string;
}) {
  const t = useT();
  const hash = useRouterState({ select: (state) => state.location.hash });
  if (!pilotUiEnabled || !mealsEnabled || !viewer || viewer !== wineOwner) return null;
  const journey = readWineJourney(hash);
  return (
    <nav className="pilot-journey" aria-label={t("journey.foodWine")}>
      {journey.kind === "ready" && (
        <Link to="/kitchen" hash={kitchenJourneyHash(journey.destination)}>
          {journey.destination.fromCook ? (
            <CookingPot size={20} aria-hidden />
          ) : (
            <ArrowLeft size={20} aria-hidden />
          )}
          {t(journey.destination.fromCook ? "journey.resumeCook" : "journey.backRecipe")}
        </Link>
      )}
      <Link to="/kitchen" hash={kitchenJourneyHash({ view: "pairings", wine: wineId })}>
        <Utensils size={20} aria-hidden />
        {t("journey.findRecipes")}
      </Link>
    </nav>
  );
}
