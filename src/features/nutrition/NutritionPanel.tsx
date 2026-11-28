import { useEffect, useState } from "react";
import { ArrowRight, ChefHat, ClipboardCheck, RotateCcw, Scale, X } from "lucide-react";
import type { RecipeDocument, RecipeVersion } from "../kitchen/domain";
import { recipeImages } from "../kitchen/catalog";
import { compareMealGoal, type MealGoal } from "../private-journal/domain";
import { referenceAttribution, referenceFoods, referenceLicense, suggestedSwap } from "./catalog";
import {
  compareLimit,
  energyMaxKcal,
  emptyBinding,
  estimateRecipe,
  formLabels,
  forms,
  nutrientKeys,
  recipeSubstitutionDraft,
  substitutionPrompt,
  type Binding,
  type Bindings,
  type FoodReference,
  type NutrientValues,
} from "./domain";
import "./nutrition.css";

const format = (n: number | null) =>
  n === null ? "Saknas" : new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(n);
const metric = {
  energyKcal: { label: "Energi", unit: "kcal", max: energyMaxKcal },
  protein: { label: "Protein", unit: "g", max: 100 },
  fat: { label: "Fett", unit: "g", max: 100 },
  carbs: { label: "Kolhydrater", unit: "g", max: 100 },
  fiber: { label: "Fiber", unit: "g", max: 100 },
} as const;
const quantity = (value: number | null, unit: string) =>
  value === null ? format(value) : `${format(value)} ${unit}`;
const numeric = (value: string) =>
  value.trim() === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
type Mode = "standard" | "low-carb" | "keto";
const emptyReplacement = (): Binding => ({
  reference: null,
  grams: null,
  weighedForm: "unknown",
  confirmed: false,
});

function useResetEpoch() {
  const [epoch, reset] = useState(0);
  useEffect(() => {
    // A restored browser page can retain React state even without browser storage.
    const clear = () => reset((value) => value + 1);
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) clear();
    };
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("pageshow", restore);
    };
  }, []);
  return epoch;
}
type NutritionPageProps = {
  versions: RecipeVersion[];
  initial?: RecipeVersion;
  initialServings?: number;
  onAdapt?: (version: RecipeVersion, prompt: string) => void;
  onDraft?: (version: RecipeVersion, draft: RecipeDocument) => void;
};
export function NutritionPage(props: NutritionPageProps) {
  const epoch = useResetEpoch();
  return <NutritionView key={epoch} {...props} />;
}
function NutritionView({
  versions,
  initial,
  initialServings,
  onAdapt,
  onDraft,
}: NutritionPageProps) {
  const [chosen, setChosen] = useState(initial?.id ?? "");
  const choices =
    initial && !versions.some((v) => v.id === initial.id) ? [initial, ...versions] : versions;
  const selected = choices.find((v) => v.id === chosen) ?? choices[0];
  return (
    <section className="nutrition-panel">
      <h1>Receptens näring</h1>
      {!selected ? (
        <p>Inga sparade recept i kokboken.</p>
      ) : (
        <>
          <label className="nutrition-field">
            Recept
            <select value={selected.id} onChange={(e) => setChosen(e.target.value)}>
              {choices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.document.title} · version {v.revision}
                </option>
              ))}
            </select>
          </label>
          <NutritionCalculation
            key={`${selected.id}:${selected.revision}`}
            document={selected.document}
            initialServings={initial?.id === selected.id ? initialServings : undefined}
            onAdapt={onAdapt ? (prompt) => onAdapt(selected, prompt) : undefined}
            onDraft={onDraft ? (draft) => onDraft(selected, draft) : undefined}
          />
        </>
      )}
    </section>
  );
}
type CalculationProps = {
  document: RecipeDocument;
  initialServings?: number;
  recipeServings?: number;
  onAdapt?: (prompt: string) => void;
  onDraft?: (draft: RecipeDocument) => void;
  personalMealGoal?: MealGoal;
};

export function PersonalMealComparison({
  goal,
  versions,
}: {
  goal: MealGoal;
  versions: RecipeVersion[];
}) {
  const [chosen, setChosen] = useState("");
  const selected = versions.find((version) => version.id === chosen);
  return (
    <div className="nutrition-panel nutrition-inline">
      <label className="nutrition-field">
        Jämför en receptportion
        <select value={selected?.id ?? ""} onChange={(e) => setChosen(e.target.value)}>
          <option value="">Välj ett sparat recept</option>
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.document.title}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <NutritionCalculation
          key={selected.id}
          document={selected.document}
          personalMealGoal={goal}
        />
      )}
    </div>
  );
}

export function RecipeNutrition(props: CalculationProps & { recipeServings: number }) {
  const epoch = useResetEpoch();
  return (
    <section className="nutrition-panel nutrition-inline" aria-label="Näring i receptet">
      <NutritionCalculation key={epoch} {...props} />
    </section>
  );
}

function NutritionMetrics({ values }: { values: NutrientValues }) {
  return (
    <dl className="nutrition-metrics">
      {nutrientKeys.map((key) => (
        <div key={key} data-missing={values[key] === null || undefined}>
          <dt>{metric[key].label}</dt>
          <dd>{quantity(values[key], metric[key].unit)}</dd>
        </div>
      ))}
    </dl>
  );
}

function NutritionCalculation({
  document,
  initialServings,
  recipeServings,
  onAdapt,
  onDraft,
  personalMealGoal,
}: CalculationProps) {
  const [bindings, setBindings] = useState<Bindings>({}),
    [selectedServings, setServings] = useState(initialServings ?? document.servings),
    [adult, setAdult] = useState(false),
    [mode, setMode] = useState<Mode>("standard"),
    [limit, setLimit] = useState<number | null>(null),
    [replacement, setReplacement] = useState(emptyReplacement),
    [swapId, setSwap] = useState("");
  const servings = recipeServings ?? selectedServings;
  const compare = adult && mode !== "standard";
  const clearSwap = () => {
    setSwap("");
    setReplacement(emptyReplacement());
  };
  const switchMode = (value: Mode) => {
    setMode(value);
    setLimit(null);
    clearSwap();
  };
  const result = estimateRecipe(document, bindings, servings),
    target = compareLimit(result.perServing.carbs, limit);
  const personal =
    personalMealGoal &&
    compareMealGoal(personalMealGoal, {
      carbsPerServing: result.perServing.carbs,
      allAmountsKnown: document.ingredients.every((ingredient) => ingredient.amount > 0),
    });
  const ingredient = compare ? document.ingredients.find((i) => i.id === swapId) : undefined;
  const draft = ingredient && recipeSubstitutionDraft(document, ingredient.id, replacement);
  const proposed =
    ingredient && draft
      ? estimateRecipe(draft, { ...bindings, [ingredient.id]: replacement }, servings)
      : null;
  const suggestion = ingredient ? suggestedSwap(bindings[ingredient.id]?.reference) : null;
  return (
    <>
      {recipeServings === undefined && !personalMealGoal && (
        <div className="nutrition-recipe">
          {recipeImages[document.image] && <img src={recipeImages[document.image]} alt="" />}
          <div>
            <h2>{document.title}</h2>
            <p>Grundrecept: {document.servings} portioner</p>
          </div>
        </div>
      )}
      {recipeServings === undefined && !personalMealGoal && (
        <label className="nutrition-field">
          Visa antal portioner
          <input
            aria-label="Antal portioner i beräkningen"
            type="number"
            min={1}
            max={24}
            step={1}
            value={servings}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isInteger(v) && v >= 1 && v <= 24) setServings(v);
            }}
          />
        </label>
      )}
      <section className="nutrition-summary" aria-label="Beräkningsresultat" aria-live="polite">
        <div className="nutrition-title">
          <Scale size={20} aria-hidden />
          <h2>{personalMealGoal ? "Kolhydrater per portion" : "Näring per portion"}</h2>
        </div>
        {personalMealGoal ? (
          personal !== "incomplete" && <p>Uppskattat: {quantity(result.perServing.carbs, "g")}.</p>
        ) : (
          <>
            <p className="nutrition-status">
              {nutrientKeys.every((key) => result.perServing[key] === null)
                ? "Underlag saknas"
                : "Uppskattade värden"}
            </p>
            <NutritionMetrics values={result.perServing} />
            <details className="nutrition-fold">
              <summary>Hela receptet · {servings} portioner</summary>
              <NutritionMetrics values={result.total} />
            </details>
          </>
        )}
        {personal === "incomplete" && (
          <p>Jämförelsen väntar på kompletta mängder och kolhydratunderlag.</p>
        )}
        {personal === "within" && (
          <p>Receptets uppskattning per portion är inom ditt angivna måltidsmål.</p>
        )}
        {personal === "above" && (
          <p>Receptets uppskattning per portion är över ditt angivna måltidsmål.</p>
        )}
      </section>
      {!personalMealGoal && (
        <details className="nutrition-fold">
          <summary>Kostläge{compare && ` · ${mode === "keto" ? "Keto" : "Lågkolhydrat"}`}</summary>
          <label className="nutrition-check">
            <input
              type="checkbox"
              checked={adult}
              onChange={(e) => {
                setAdult(e.target.checked);
                if (!e.target.checked) switchMode("standard");
              }}
            />
            Jag är vuxen
          </label>
          <fieldset className="nutrition-mode">
            <legend>Frivilligt läge för detta recept</legend>
            {(
              [
                ["standard", "Standard"],
                ["low-carb", "Lågkolhydrat"],
                ["keto", "Keto"],
              ] as const
            ).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="nutrition-mode"
                  value={value}
                  checked={mode === value}
                  disabled={value !== "standard" && !adult}
                  onChange={() => switchMode(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          {compare && (
            <>
              <p>
                Receptuppskattning för vuxna, inte medicinsk rådgivning eller ett besked om ketos.
              </p>
              <label className="nutrition-field">
                Egen gräns för kolhydrater, g per portion (valfri)
                <input
                  type="number"
                  min={0.1}
                  max={250}
                  step="any"
                  value={limit ?? ""}
                  onChange={(e) => setLimit(numeric(e.target.value))}
                />
              </label>
              {target === "within" && <p>Beräkningen ligger inom din valda gräns.</p>}
              {target === "above" && <p>Beräkningen ligger över din valda gräns.</p>}
            </>
          )}
        </details>
      )}
      <details className="nutrition-fold nutrition-band">
        <summary>Ingrediensunderlag</summary>
        <div className="k-section-title">
          <button
            className="k-text"
            onClick={() => {
              setBindings({});
              clearSwap();
              setLimit(null);
            }}
          >
            <RotateCcw size={18} />
            Rensa underlaget
          </button>
        </div>
        <p>
          Gramvikter avser hela grundreceptet med {document.servings} portioner och endast den
          ätliga delen. Portionsvalet skalar alla mängder lika.
        </p>
        <ol className="nutrition-ingredients">
          {result.rows.map(({ ingredient, reason, nutrients }, index) => (
            <li key={ingredient.id}>
              <h3>{ingredient.name}</h3>
              <p>
                {ingredient.amount} {ingredient.unit} i grundreceptet
              </p>
              {ingredient.amount === 0 ? (
                <p>Mängden är 0 och bidraget är 0.</p>
              ) : (
                <>
                  <BindingEditor
                    prefix={`ingredient-${index}`}
                    binding={bindings[ingredient.id] ?? emptyBinding(ingredient)}
                    onChange={(b) =>
                      setBindings((previous) => ({ ...previous, [ingredient.id]: b }))
                    }
                  />
                  {reason ? (
                    <p className="nutrition-unknown" role="status">
                      {reason}
                    </p>
                  ) : (
                    <p>
                      Beräknat bidrag: {quantity(nutrients?.carbs ?? null, "g")} kolhydrater i
                      grundreceptet.
                    </p>
                  )}
                  {compare && (
                    <button
                      className="k-text"
                      aria-expanded={swapId === ingredient.id}
                      onClick={() => {
                        clearSwap();
                        if (swapId !== ingredient.id) setSwap(ingredient.id);
                      }}
                    >
                      Jämför ett byte
                      <ArrowRight size={17} />
                    </button>
                  )}
                  {swapId === ingredient.id && compare && (
                    <section className="nutrition-band" aria-label="Ingrediensjämförelse">
                      <h3>Byta {ingredient.name}?</h3>
                      {suggestion && (
                        <button
                          className="k-secondary"
                          onClick={() =>
                            setReplacement({ ...emptyReplacement(), reference: suggestion })
                          }
                        >
                          <ArrowRight size={18} />
                          Förslag: {suggestion.name}
                        </button>
                      )}
                      <BindingEditor
                        prefix="replacement"
                        binding={replacement}
                        onChange={setReplacement}
                      />
                      <table className="nutrition-comparison">
                        <caption>Näring per portion</caption>
                        <thead>
                          <tr>
                            <th scope="col">Näringsvärde</th>
                            <th scope="col">Original</th>
                            <th scope="col">Med bytet</th>
                          </tr>
                        </thead>
                        <tbody>
                          {nutrientKeys.map((key) => (
                            <tr key={key}>
                              <th scope="row">{metric[key].label}</th>
                              <td>{quantity(result.perServing[key], metric[key].unit)}</td>
                              <td>
                                {quantity(proposed?.perServing[key] ?? null, metric[key].unit)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {draft && (
                        <p>
                          Tillagningsstegen är oförändrade i utkastet och behöver granskas. Bytet
                          kan påverka allergener och tillagning.
                        </p>
                      )}
                      <div className="nutrition-actions">
                        <button
                          className="k-secondary"
                          disabled={!draft || !onDraft}
                          onClick={() => {
                            if (draft) onDraft?.(draft);
                          }}
                        >
                          <ClipboardCheck size={18} /> Granska receptutkast
                        </button>
                        {onAdapt && (
                          <button
                            className="k-text"
                            disabled={!draft}
                            onClick={() => {
                              if (draft && replacement.reference && replacement.grams !== null)
                                onAdapt(
                                  substitutionPrompt(
                                    ingredient.name,
                                    replacement.reference.name,
                                    replacement.grams,
                                    document.servings,
                                  ),
                                );
                            }}
                          >
                            <ChefHat size={18} /> Granska bytet med AI-kocken
                          </button>
                        )}
                        <button className="k-text" onClick={clearSwap}>
                          <X size={18} /> Avbryt jämförelsen
                        </button>
                      </div>
                    </section>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      </details>
      <details className="nutrition-fold">
        <summary>Källor och beräkning</summary>
        <p>
          {referenceAttribution}. Urval av generiska referenser, inte en fullständig produktdatabas.
        </p>
        <p>
          EU-kolhydrater används som angivet. För US Total Carbohydrate dras registrerad fiber av en
          gång. Sockeralkoholer dras inte av. Saknade värden är okända, inte noll.
        </p>
        <p>
          Referensvärden och bekräftade ätliga vikter ger uppskattningar, inte uppmätta värden för
          den lagade rätten.
        </p>
        <p>
          <a
            href="https://soknaringsinnehall.livsmedelsverket.se/"
            target="_blank"
            rel="noreferrer"
          >
            Livsmedelsverket
          </a>{" "}
          ·{" "}
          <a href={referenceLicense} target="_blank" rel="noreferrer">
            CC BY 4.0
          </a>
        </p>
        <p>
          Underlaget och läget finns bara i denna öppna vy. Det sparas inte i webbläsarlagring,
          konto, matminne eller familjeprofiler.
        </p>
      </details>
    </>
  );
}
function BindingEditor({
  binding,
  onChange,
  prefix,
}: {
  binding: Binding;
  onChange: (value: Binding) => void;
  prefix: string;
}) {
  const r = binding.reference;
  const change = (patch: Partial<Binding>) => onChange({ ...binding, ...patch, confirmed: false });
  const manual = (patch: Partial<FoodReference>) => {
    if (r) change({ reference: { ...r, ...patch } });
  };
  return (
    <fieldset className="nutrition-binding">
      <legend className="sr-only">Underlag {prefix}</legend>
      <label className="nutrition-field" htmlFor={`${prefix}-food`}>
        Livsmedelsreferens
      </label>
      <select
        id={`${prefix}-food`}
        value={r?.source.kind === "label" ? "manual" : (r?.id ?? "")}
        onChange={(e) =>
          change({
            reference:
              e.target.value === "manual"
                ? {
                    id: `manual:${prefix}`,
                    name: "",
                    form: "as_sold",
                    convention: "EU",
                    energyKcal: null,
                    carbs: null,
                    fiber: null,
                    protein: null,
                    fat: null,
                    source: { kind: "label", label: "" },
                  }
                : (referenceFoods.find((f) => f.id === e.target.value) ?? null),
            weighedForm: "unknown",
          })
        }
      >
        <option value="">Välj referens…</option>
        {referenceFoods.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name} · {formLabels[f.form]}
          </option>
        ))}
        <option value="manual">Egen förpackningsetikett</option>
      </select>
      {r?.source.kind === "slv" && (
        <details className="nutrition-source">
          <summary>Referensvärden och version</summary>
          <p>
            {r.name} · {formLabels[r.form]}
          </p>
          <p>
            Per 100 g:{" "}
            {nutrientKeys
              .map((key) => `${metric[key].label} ${quantity(r[key], metric[key].unit)}`)
              .join(" · ")}
            .
          </p>
          <p>
            Livsmedelsnummer {r.source.recordId}. Databas {r.source.datasetVersion}. Postversion{" "}
            {r.source.recordVersion}. Hämtad {r.source.retrievedAt.slice(0, 10)}.
          </p>
          <a href={r.source.url} target="_blank" rel="noreferrer">
            Originalpost (JSON)
          </a>
        </details>
      )}
      {r?.source.kind === "label" && (
        <>
          <label className="nutrition-field">
            Produkt och etikett
            <input
              aria-label={`Produkt och etikett ${prefix}`}
              maxLength={120}
              value={r.name}
              onChange={(e) =>
                manual({ name: e.target.value, source: { kind: "label", label: e.target.value } })
              }
            />
          </label>
          <label className="nutrition-field">
            Etikettens kolhydratdefinition
            <select
              aria-label={`Kolhydratdefinition ${prefix}`}
              value={r.convention}
              onChange={(e) => manual({ convention: e.target.value as "EU" | "US" })}
            >
              <option value="EU">EU: kolhydrater utan fiber</option>
              <option value="US">US: Total Carbohydrate inklusive fiber</option>
            </select>
          </label>
          <label className="nutrition-field">
            Produktens form
            <select
              aria-label={`Produktens form ${prefix}`}
              value={r.form}
              onChange={(e) => {
                onChange({
                  ...binding,
                  reference: { ...r, form: e.target.value as FoodReference["form"] },
                  weighedForm: "unknown",
                  confirmed: false,
                });
              }}
            >
              {forms.map((f) => (
                <option key={f} value={f}>
                  {formLabels[f]}
                </option>
              ))}
            </select>
          </label>
          <div className="nutrition-label-values">
            {nutrientKeys.map((key) => (
              <label key={key} className="nutrition-field">
                {metric[key].label}, {metric[key].unit} per 100 g
                <input
                  aria-label={`${metric[key].label} per 100 g ${prefix}`}
                  type="number"
                  min={0}
                  max={metric[key].max}
                  step="any"
                  value={r[key] ?? ""}
                  onChange={(e) => manual({ [key]: numeric(e.target.value) })}
                />
              </label>
            ))}
          </div>
        </>
      )}
      <div className="nutrition-weight">
        <label className="nutrition-field" htmlFor={`${prefix}-grams`}>
          Gram i hela grundreceptet
        </label>
        <input
          id={`${prefix}-grams`}
          type="number"
          min={0.001}
          max={100000}
          step="any"
          value={binding.grams ?? ""}
          onChange={(e) => change({ grams: numeric(e.target.value) })}
        />
        <label className="nutrition-field" htmlFor={`${prefix}-form`}>
          Vikten gäller
        </label>
        <select
          id={`${prefix}-form`}
          value={binding.weighedForm}
          onChange={(e) => change({ weighedForm: e.target.value as Binding["weighedForm"] })}
        >
          <option value="unknown">Välj vägd form…</option>
          {forms.map((f) => (
            <option key={f} value={f}>
              {formLabels[f]}
            </option>
          ))}
        </select>
      </div>
      <label className="nutrition-check">
        <input
          type="checkbox"
          checked={binding.confirmed}
          onChange={(e) => onChange({ ...binding, confirmed: e.target.checked })}
        />
        Jag har kontrollerat referens, form och ätlig gramvikt
      </label>
    </fieldset>
  );
}
