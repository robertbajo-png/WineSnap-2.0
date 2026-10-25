import { useState } from "react";
import { ArrowRight, ChefHat, RotateCcw, Scale } from "lucide-react";
import type { RecipeDocument, RecipeVersion } from "../kitchen/domain";
import { recipeImages } from "../kitchen/catalog";
import { referenceAttribution, referenceFoods, referenceLicense } from "./catalog";
import {
  compareLimit,
  emptyBinding,
  estimateRecipe,
  formLabels,
  forms,
  resolveBinding,
  substitutionPrompt,
  type Binding,
  type Bindings,
  type FoodReference,
} from "./domain";
import "./nutrition.css";

const format = (n: number | null) =>
  n === null ? "Okänt" : new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(n);
const numeric = (value: string) =>
  value.trim() === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
export function NutritionPage({
  versions,
  initial,
  initialServings,
  onAdapt,
}: {
  versions: RecipeVersion[];
  initial?: RecipeVersion;
  initialServings?: number;
  onAdapt?: (version: RecipeVersion, prompt: string) => void;
}) {
  const [chosen, setChosen] = useState(initial?.id ?? ""),
    [mode, setMode] = useState("standard");
  const choices =
    initial && !versions.some((v) => v.id === initial.id) ? [initial, ...versions] : versions;
  const selected = choices.find((v) => v.id === chosen) ?? choices[0];
  return (
    <section className="nutrition-panel">
      <p className="k-eyebrow">Receptets underlag</p>
      <h1>Kolhydrater & ingrediensbyten</h1>
      <fieldset className="nutrition-mode">
        <legend>Frivilligt läge för vuxna</legend>
        {[
          ["standard", "Standard"],
          ["low-carb", "Lågkolhydrat"],
          ["keto", "Keto"],
        ].map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="nutrition-mode"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {mode === "standard" ? (
        <p>
          Inget kostläge är valt. Valet sparas inte och förs inte över till familjens matprofiler.
        </p>
      ) : (
        <>
          <p>
            Receptuppskattning för vuxna, inte en medicinsk kostplan eller ett besked om ketos. Inte
            till för barns kost, läkemedelsdosering eller behandling. Vid medicinska behov behöver
            du råd från vården.
          </p>
          {!selected ? (
            <p>Spara ett recept i kokboken först.</p>
          ) : (
            <>
              <label className="nutrition-field">
                Recept
                <select
                  aria-label="Recept för kolhydratberäkning"
                  value={selected.id}
                  onChange={(e) => setChosen(e.target.value)}
                >
                  {choices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.document.title} · version {v.revision}
                    </option>
                  ))}
                </select>
              </label>
              <NutritionCalculation
                key={`${selected.id}:${mode}:${JSON.stringify(selected.document)}`}
                document={selected.document}
                initialServings={initial?.id === selected.id ? initialServings : undefined}
                onAdapt={onAdapt ? (prompt) => onAdapt(selected, prompt) : undefined}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
export function NutritionCalculation({
  document,
  initialServings,
  onAdapt,
}: {
  document: RecipeDocument;
  initialServings?: number;
  onAdapt?: (prompt: string) => void;
}) {
  const [bindings, setBindings] = useState<Bindings>({}),
    [servings, setServings] = useState(initialServings ?? document.servings),
    [limit, setLimit] = useState<number | null>(null),
    [replacement, setReplacement] = useState<Binding>({
      reference: null,
      grams: null,
      weighedForm: "unknown",
      confirmed: false,
    }),
    [swapId, setSwap] = useState("");
  const result = estimateRecipe(document, bindings, servings),
    target = compareLimit(result.perServing.carbs, limit);
  const ingredient = document.ingredients.find((i) => i.id === swapId);
  const proposed = ingredient
    ? estimateRecipe(document, { ...bindings, [ingredient.id]: replacement }, servings)
    : null;
  const canAdapt =
    ingredient && replacement.reference && resolveBinding(replacement).macros !== null;
  return (
    <>
      <div className="nutrition-recipe">
        {recipeImages[document.image] && <img src={recipeImages[document.image]} alt="" />}
        <div>
          <h2>{document.title}</h2>
          <p>Grundrecept: {document.servings} portioner</p>
        </div>
      </div>
      <div className="nutrition-controls">
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
        <label className="nutrition-field">
          Egen gräns, g per portion (valfri)
          <input
            type="number"
            min={0.1}
            max={250}
            step="any"
            value={limit ?? ""}
            onChange={(e) => setLimit(numeric(e.target.value))}
          />
        </label>
      </div>
      <section className="nutrition-summary" aria-label="Beräkningsresultat" aria-live="polite">
        <div>
          <Scale size={25} />
          <div>
            <h2>Kolhydrater per portion</h2>
            <strong>
              {result.complete ? `${format(result.perServing.carbs)} g` : "Ofullständigt underlag"}
            </strong>
          </div>
        </div>
        <p>
          {result.known} av {result.rows.length} ingredienser har kolhydratunderlag.
        </p>
        {target === "within" && (
          <p>
            Beräkningen ligger inom din valda gräns. Det är inte en bedömning av kostens lämplighet.
          </p>
        )}
        {target === "above" && <p>Beräkningen ligger över din valda gräns.</p>}
        {result.complete && (
          <dl>
            <dt>Hela receptet, {servings} portioner</dt>
            <dd>{format(result.total.carbs)} g</dd>
            <dt>Fiber per portion</dt>
            <dd>{format(result.perServing.fiber)} g</dd>
            <dt>Protein per portion</dt>
            <dd>{format(result.perServing.protein)} g</dd>
            <dt>Fett per portion</dt>
            <dd>{format(result.perServing.fat)} g</dd>
          </dl>
        )}
        <p>
          Beräknat från referensvärden och dina bekräftade vikter, inte analyserat i den lagade
          rätten. Tillagningsförluster, spill och kvarlämnad sås är inte beräknade.
        </p>
      </section>
      <section className="nutrition-band">
        <div className="k-section-title">
          <h2>Ingrediensunderlag</h2>
          <button
            className="k-text"
            onClick={() => {
              setBindings({});
              setReplacement({
                reference: null,
                grams: null,
                weighedForm: "unknown",
                confirmed: false,
              });
              setSwap("");
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
          {result.rows.map(({ ingredient, reason, macros }, index) => (
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
                    onChange={(b) => setBindings({ ...bindings, [ingredient.id]: b })}
                  />
                  {reason ? (
                    <p className="nutrition-unknown" role="status">
                      {reason}
                    </p>
                  ) : (
                    <p>
                      Beräknat bidrag: {format(macros?.carbs ?? null)} g kolhydrater i
                      grundreceptet.
                    </p>
                  )}
                  <button
                    className="k-text"
                    onClick={() => {
                      setSwap(ingredient.id);
                      setReplacement({
                        reference: null,
                        grams: null,
                        weighedForm: "unknown",
                        confirmed: false,
                      });
                    }}
                  >
                    Jämför ett byte
                    <ArrowRight size={17} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ol>
      </section>
      {ingredient && (
        <section className="nutrition-band" aria-label="Ingrediensjämförelse">
          <h2>Byta {ingredient.name}?</h2>
          <p>
            Räkneexempel, inte ett färdigt recept. Välj en ersättare och dess gramvikt. Ett byte kan
            ändra smak, konsistens, allergener och tillagning.
          </p>
          <BindingEditor prefix="replacement" binding={replacement} onChange={setReplacement} />
          <dl className="nutrition-comparison">
            <dt>Original, g kolhydrater per portion</dt>
            <dd>{format(result.perServing.carbs)}</dd>
            <dt>Med bytet, g kolhydrater per portion</dt>
            <dd>{format(proposed?.perServing.carbs ?? null)}</dd>
          </dl>
          {!proposed?.complete && (
            <p>Komplett jämförelse kräver underlag för samtliga ingredienser.</p>
          )}
          <button
            className="k-secondary"
            disabled={!canAdapt || !onAdapt}
            onClick={() => {
              if (onAdapt && canAdapt && replacement.reference && replacement.grams !== null)
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
            <ChefHat size={18} />
            Granska bytet med AI-kocken
          </button>
          <p>
            Öppnar en redigerbar receptfråga. Ingen AI-fråga skickas och inget recept ändras innan
            du själv väljer det. AI-kocken kräver anslutning.
          </p>
        </section>
      )}
      <section className="nutrition-band">
        <h2>Källa & beräkning</h2>
        <p>
          {referenceAttribution}. Urval av generiska referenser, inte en fullständig produktdatabas.
        </p>
        <p>
          EU-kolhydrater används som angivet. För US Total Carbohydrate dras registrerad fiber av en
          gång. Sockeralkoholer dras inte av. Saknade värden är okända, inte noll.
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
      </section>
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
            Per 100 g: kolhydrater {format(r.carbs)} g, fiber {format(r.fiber)} g, protein{" "}
            {format(r.protein)} g, fett {format(r.fat)} g.
          </p>
          <p>
            Livsmedelsnummer {r.source.recordId}. Postversion {r.source.recordVersion}. Hämtad{" "}
            {r.source.retrievedAt.slice(0, 10)}.
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
            {(
              [
                ["carbs", "Kolhydrater"],
                ["fiber", "Fiber"],
                ["protein", "Protein"],
                ["fat", "Fett"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="nutrition-field">
                {label}, g per 100 g
                <input
                  aria-label={`${label} per 100 g ${prefix}`}
                  type="number"
                  min={0}
                  max={100}
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
