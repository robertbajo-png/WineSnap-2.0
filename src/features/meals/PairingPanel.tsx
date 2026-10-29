import { useMemo, useState } from "react";
import { ArrowRight, RefreshCw, Utensils, Wine } from "lucide-react";
import { WineImage } from "@/components/WineImage";
import { cellarWines, familyData } from "./api";
import {
  assessPairing,
  familyFit,
  inferDishTraits,
  rankPairingWines,
  traitLabels,
  traits,
  type DishTrait,
  type PairingAssessment,
  type RecipeChoice,
} from "./domain";
import { recipeImages, startingRecipes } from "../kitchen/catalog";
import type { RecipeDocument, RecipeVersion } from "../kitchen/domain";
import { useFreshData } from "./useFreshData";
import "./meals.css";

export function PairingNotes({ assessment }: { assessment: PairingAssessment }) {
  return (
    <div className="meal-reasons">
      <strong>{assessment.label}</strong>
      <ul>
        {assessment.evidence.map((e) => (
          <li key={e}>{e}</li>
        ))}
        {assessment.cautions.map((e) => (
          <li className="meal-caution" key={e}>
            {e}
          </li>
        ))}
        {assessment.unknown.map((e) => (
          <li className="meal-unknown" key={e}>
            {e}
          </li>
        ))}
      </ul>
    </div>
  );
}
export function PairingPanel({
  owner,
  versions,
  initial,
  onOpen,
}: {
  owner: string;
  versions: RecipeVersion[];
  initial?: RecipeVersion;
  onOpen: (document: RecipeDocument, version?: RecipeVersion) => void;
}) {
  const { data, error, refresh } = useFreshData(async () => ({
    cellar: await cellarWines(owner),
    family: await familyData(owner),
  }));
  const choices = useMemo<RecipeChoice[]>(
    () => [
      ...versions.map((v) => ({ key: v.id, document: v.document, version: v })),
      ...startingRecipes.map((d, i) => ({ key: `starter-${i}`, document: d })),
    ],
    [versions],
  );
  const [mode, setMode] = useState<"dish" | "wine">(() =>
      typeof window !== "undefined" && window.location.hash.includes("?wine=") ? "wine" : "dish",
    ),
    [recipeId, setRecipe] = useState(initial?.id ?? ""),
    [wineId, setWine] = useState(
      () =>
        new URLSearchParams(
          typeof window === "undefined" ? "" : window.location.hash.split("?")[1],
        ).get("wine") ?? "",
    );
  const [selectedTraits, setTraits] = useState<DishTrait[] | null>(null),
    [people, setPeople] = useState<string[]>([]),
    [adults, setAdults] = useState(false);
  const recipe = choices.find((c) => c.key === recipeId) ?? choices[0];
  const available = data?.cellar.wines.filter((w) => w.quantity > 0 && !w.consumed_at) ?? [];
  const wine = available.find((w) => w.id === wineId) ?? available[0];
  const diners = data?.family.diners.filter((d) => people.includes(d.id)) ?? [];
  const onlyChildren = diners.length > 0 && diners.every((d) => d.document.kind === "child");
  const dish = selectedTraits ?? (recipe ? inferDishTraits(recipe.document) : []);
  const ranked = recipe && data ? rankPairingWines(data.cellar.wines, owner, dish) : [];
  const dishes = wine
    ? choices
        .map((r) => ({
          r,
          fit: familyFit(r.document, diners),
          assessment: assessPairing(wine, inferDishTraits(r.document)),
        }))
        .sort(
          (a, b) =>
            a.fit.conflicts.length - b.fit.conflicts.length ||
            b.assessment.rank - a.assessment.rank,
        )
    : [];
  return (
    <section className="meal-panel">
      <div className="k-title-row">
        <div>
          <p className="k-eyebrow">Vid bordet</p>
          <h1>Mat & vin</h1>
        </div>
        <button
          className="k-text"
          aria-label="Hämta mat- och vinuppgifter"
          title="Hämta mat- och vinuppgifter"
          onClick={() => void refresh()}
        >
          <RefreshCw size={20} />
        </button>
      </div>
      {error && (
        <p role="alert" className="k-error">
          {error}
        </p>
      )}
      {!data && !error && <p aria-busy="true">Hämtar…</p>}
      {data && (
        <>
          <fieldset className="meal-diners">
            <legend>Vilka äter?</legend>
            {data.family.diners.length === 0 ? (
              <p>
                Inga matprofiler valda. <a href="#family">Hantera familj</a>
              </p>
            ) : (
              data.family.diners.map((d) => (
                <label className="meal-check" key={d.id}>
                  <input
                    type="checkbox"
                    checked={people.includes(d.id)}
                    onChange={(e) =>
                      setPeople(
                        e.target.checked ? [...people, d.id] : people.filter((id) => id !== d.id),
                      )
                    }
                  />
                  {d.document.name}
                  {d.document.kind === "child" ? " (barn)" : ""}
                </label>
              ))
            )}
          </fieldset>
          <label className="meal-check">
            <input
              type="checkbox"
              checked={adults && !onlyChildren}
              disabled={onlyChildren}
              onChange={(e) => setAdults(e.target.checked)}
            />
            Visa vinförslag till vuxna från min vinkällare
          </label>
          {onlyChildren && <p>Endast barnprofiler är valda. Vinförslag är avstängda.</p>}
          {!adults || onlyChildren ? (
            <section className="meal-band">
              <h2>Mat till sällskapet</h2>
              <RecipeList choices={choices} diners={diners} onOpen={onOpen} />
            </section>
          ) : (
            <>
              <fieldset className="meal-mode">
                <legend className="sr-only">Utgångspunkt</legend>
                <label>
                  <input
                    type="radio"
                    name="pair-mode"
                    checked={mode === "dish"}
                    onChange={() => setMode("dish")}
                  />
                  <Utensils size={18} />
                  Från maten
                </label>
                <label>
                  <input
                    type="radio"
                    name="pair-mode"
                    checked={mode === "wine"}
                    onChange={() => setMode("wine")}
                  />
                  <Wine size={18} />
                  Från vinet
                </label>
              </fieldset>
              {data.cellar.truncated && (
                <p>Visar de senaste 200 vinerna. Äldre flaskor ingår inte i förslagen.</p>
              )}
              {mode === "dish" && recipe && (
                <>
                  <label>
                    Rätt
                    <select
                      aria-label="Rätt"
                      value={recipe.key}
                      onChange={(e) => {
                        setRecipe(e.target.value);
                        setTraits(null);
                      }}
                    >
                      {choices.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.document.title}
                          {c.version ? "" : " · inspirationsrecept"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <FamilyNotes fit={familyFit(recipe.document, diners)} />
                  <fieldset className="meal-traits">
                    <legend>Antagen smakprofil</legend>
                    {traits.map((t) => (
                      <label className="meal-check" key={t}>
                        <input
                          type="checkbox"
                          checked={dish.includes(t)}
                          onChange={(e) =>
                            setTraits(e.target.checked ? [...dish, t] : dish.filter((v) => v !== t))
                          }
                        />
                        {traitLabels[t]}
                      </label>
                    ))}
                  </fieldset>
                  <p className="meal-caption">
                    Förslag utifrån ingrediensnamn och registrerade vinuppgifter. Justera
                    smakprofilen efter tillagningen. Inte en garanti för smak eller
                    allergensäkerhet.
                  </p>
                  {!dish.length ? (
                    <p>Välj minst en smakegenskap.</p>
                  ) : (
                    <ul className="meal-results">
                      {ranked.slice(0, 8).map(({ wine: w, assessment }) => (
                        <li key={w.id}>
                          <div className="meal-result-head">
                            {w.image_url ? (
                              <WineImage src={w.image_url} alt="" className="meal-wine-photo" />
                            ) : (
                              <Wine size={28} />
                            )}
                            <div>
                              <h2>
                                {w.wine_name ?? "Namnlöst vin"} {w.vintage ?? ""}
                              </h2>
                              <p>{[w.region, w.country].filter(Boolean).join(", ")}</p>
                              <p>{w.quantity} flaskor i din källare</p>
                            </div>
                          </div>
                          <PairingNotes assessment={assessment} />
                          <a href={`/wine/${w.id}`} className="k-text">
                            Visa vinet
                            <ArrowRight size={17} />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!ranked.length && (
                    <p>
                      Inga tillgängliga flaskor i din vinkällare. Inga köpförslag har hittats på.
                    </p>
                  )}
                </>
              )}
              {mode === "wine" && (
                <>
                  {wine ? (
                    <>
                      <label>
                        Vin från din källare
                        <select
                          aria-label="Vin från din källare"
                          value={wine.id}
                          onChange={(e) => setWine(e.target.value)}
                        >
                          {available.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.wine_name ?? "Namnlöst vin"} {w.vintage ?? ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <ul className="meal-results">
                        {dishes.slice(0, 8).map(({ r, assessment, fit }) => (
                          <li key={r.key}>
                            <RecipeHeading choice={r} />
                            <FamilyNotes fit={fit} />
                            <PairingNotes assessment={assessment} />
                            <button
                              className="k-text"
                              onClick={() => onOpen(r.document, r.version)}
                            >
                              Öppna recept
                              <ArrowRight size={17} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p>Inga tillgängliga flaskor i din vinkällare.</p>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
function RecipeHeading({ choice }: { choice: RecipeChoice }) {
  return (
    <div className="meal-result-head">
      {recipeImages[choice.document.image] && (
        <img src={recipeImages[choice.document.image]} alt="" className="meal-food-photo" />
      )}
      <div>
        <h2>{choice.document.title}</h2>
        <p>
          {choice.document.totalMinutes} min ·{" "}
          {choice.version ? "Sparat recept" : "Inspirationsrecept"}
        </p>
      </div>
    </div>
  );
}
function FamilyNotes({ fit }: { fit: ReturnType<typeof familyFit> }) {
  return (
    <div className="meal-family-notes">
      {fit.conflicts.map((c) => (
        <p className="meal-caution" key={c}>
          {c}
        </p>
      ))}
      {fit.likes.map((c) => (
        <p key={c}>{c}</p>
      ))}
      {fit.unknown.map((c) => (
        <p key={c}>{c}</p>
      ))}
    </div>
  );
}
function RecipeList({
  choices,
  diners,
  onOpen,
}: {
  choices: RecipeChoice[];
  diners: Parameters<typeof familyFit>[1];
  onOpen: (d: RecipeDocument, v?: RecipeVersion) => void;
}) {
  return (
    <ul className="meal-results">
      {choices
        .map((c) => ({ c, fit: familyFit(c.document, diners) }))
        .sort(
          (a, b) =>
            a.fit.conflicts.length - b.fit.conflicts.length ||
            b.fit.likes.length - a.fit.likes.length,
        )
        .slice(0, 8)
        .map(({ c, fit }) => (
          <li key={c.key}>
            <RecipeHeading choice={c} />
            <FamilyNotes fit={fit} />
            <button className="k-text" onClick={() => onOpen(c.document, c.version)}>
              Öppna recept
              <ArrowRight size={17} />
            </button>
          </li>
        ))}
    </ul>
  );
}
