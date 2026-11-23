import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  PackageOpen,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { units, type RecipeVersion } from "../kitchen/domain";
import {
  buildShoppingList,
  maxPlanDiners,
  mealSlots,
  neighboringWeek,
  purchaseSchema,
  weekDates,
  weekForDate,
  weekPlanSchema,
  type PlannedMeal,
  type Purchase,
} from "./domain";
import { useWeekPlan } from "./useWeekPlan";
import { suggestPantryShopping, type PantrySnapshot } from "../pantry/domain";
import { ownedPlanDiners } from "../meals/api";
import { familyFit, type Diner } from "../meals/domain";
import { useFreshData } from "../meals/useFreshData";
import "./planning.css";

const meals = { breakfast: "Frukost", lunch: "Lunch", dinner: "Middag", snack: "Mellanmål" };
const unitLabels = {
  g: "g",
  kg: "kg",
  ml: "ml",
  dl: "dl",
  l: "l",
  tsp: "tsk",
  tbsp: "msk",
  pcs: "st",
  pinch: "nypa",
};
const dayName = new Intl.DateTimeFormat("sv-SE", { weekday: "long", timeZone: "UTC" });
const dayDate = new Intl.DateTimeFormat("sv-SE", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const amountFormat = new Intl.NumberFormat("sv-SE", { maximumSignificantDigits: 7 });
const calendarDate = (day: string) => new Date(day + "T00:00:00Z");
const portionText = (n: number) => (n === 1 ? "1 portion" : n + " portioner");
const amountText = ({ amount, unit }: Pick<Purchase, "amount" | "unit">) =>
  amount === null
    ? "Mängd ej angiven"
    : amountFormat.format(amount) + (unit ? " " + unitLabels[unit] : "");
const emptyPurchase: Purchase = { name: "", amount: null, unit: null };

function localWeek() {
  const date = new Date();
  const pad = (number: number) => String(number).padStart(2, "0");
  return weekForDate(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`);
}

function IconAction({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="k-icon"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function PlanDialog({
  title,
  description,
  close,
  children,
}: {
  title: string;
  description: string;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="kitchen-dialog k-plan-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

type MealEditor = { date: string; original?: PlannedMeal };
function EditMeal({
  editor,
  versions,
  dayMeals,
  audience,
  commit,
  close,
}: {
  editor: MealEditor;
  versions: RecipeVersion[];
  dayMeals: PlannedMeal[];
  audience?: ReturnType<typeof useFreshData<Diner[]>>;
  commit: (meal: PlannedMeal) => boolean;
  close: () => void;
}) {
  const availableSlots = mealSlots.filter(
    (slot) => slot === editor.original?.meal || !dayMeals.some((meal) => meal.meal === slot),
  );
  const [meal, setMeal] = useState<PlannedMeal["meal"]>(
    editor.original?.meal ?? (availableSlots.includes("dinner") ? "dinner" : availableSlots[0]),
  );
  const [recipeVersionId, setRecipe] = useState(
    editor.original?.recipeVersionId ?? versions[0]?.id ?? "",
  );
  const [servings, setServings] = useState(
    String(editor.original?.servings ?? versions[0]?.document.servings ?? 2),
  );
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState(editor.original?.dinerIds ?? []);
  const selectedVersion = versions.find((version) => version.id === recipeVersionId);
  const available = audience?.data;
  const selectedDiners = available?.filter((diner) => chosen.includes(diner.id)) ?? [];
  const missingDiners = available ? chosen.length - selectedDiners.length : 0;
  const fit = selectedVersion && familyFit(selectedVersion.document, selectedDiners);
  const preferences = fit ? [...fit.conflicts, ...fit.likes, ...fit.unknown] : [];
  function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !commit({
        date: editor.date,
        meal,
        recipeVersionId,
        servings: Number(servings),
        ...(chosen.length ? { dinerIds: chosen.slice().sort() } : {}),
      })
    )
      setFailed(true);
  }
  const versionAvailable = !!selectedVersion;
  return (
    <PlanDialog
      title={editor.original ? "Redigera måltid" : "Lägg till måltid"}
      description={dayDate.format(calendarDate(editor.date))}
      close={close}
    >
      <form onSubmit={submit}>
        <label>
          Måltid
          <select value={meal} onChange={(e) => setMeal(e.target.value as PlannedMeal["meal"])}>
            {availableSlots.map((slot) => (
              <option key={slot} value={slot}>
                {meals[slot]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Recept
          <select
            value={recipeVersionId}
            required
            onChange={(event) => {
              const value = event.target.value;
              setRecipe(value);
              const version = versions.find((candidate) => candidate.id === value);
              if (version) setServings(String(version.document.servings));
            }}
          >
            {!versionAvailable && (
              <option value={recipeVersionId} disabled>
                Välj ett tillgängligt recept
              </option>
            )}
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.document.title} (v{version.revision})
              </option>
            ))}
          </select>
        </label>
        <label>
          Portioner
          <input
            required
            type="number"
            min={1}
            max={24}
            step={1}
            value={servings}
            onChange={(event) => setServings(event.target.value)}
          />
        </label>
        {audience && (
          <fieldset className="k-plan-audience">
            <legend>Vilka äter?</legend>
            {available === null || available === undefined ? (
              audience.error ? (
                <div className="k-plan-row">
                  <p>Familjeprofilerna kunde inte hämtas.</p>
                  <button
                    type="button"
                    className="k-secondary"
                    onClick={() => void audience.refresh()}
                  >
                    Försök igen
                  </button>
                </div>
              ) : (
                <p aria-busy="true">Hämtar familjeprofiler…</p>
              )
            ) : available.length === 0 ? (
              <p>Inga egna familjeprofiler.</p>
            ) : (
              <div className="k-plan-diners">
                {available.map((diner) => {
                  const checked = chosen.includes(diner.id);
                  return (
                    <label key={diner.id} className="k-plan-diner">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && chosen.length >= maxPlanDiners}
                        onChange={(event) => {
                          const pick = event.target.checked;
                          setChosen((current) =>
                            pick ? [...current, diner.id] : current.filter((id) => id !== diner.id),
                          );
                        }}
                      />
                      <span>{diner.document.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {missingDiners > 0 && (
              <div className="k-plan-row">
                <p>Valda profiler saknas: {missingDiners}</p>
                <button
                  type="button"
                  className="k-secondary"
                  onClick={() => setChosen(selectedDiners.map((diner) => diner.id))}
                >
                  Ta bort val som saknas
                </button>
              </div>
            )}
            {preferences.length > 0 && (
              <div className="k-plan-diner-notes">
                <strong>Matpreferenser</strong>
                <ul>
                  {preferences.map((entry, index) => (
                    <li key={index}>{entry}</li>
                  ))}
                </ul>
              </div>
            )}
          </fieldset>
        )}
        {failed && <p role="alert">Måltiden kunde inte läggas till i utkastet.</p>}
        <button type="submit" className="k-primary" disabled={!versionAvailable}>
          Klar
        </button>
      </form>
    </PlanDialog>
  );
}

function EditPurchase({
  title,
  initial,
  commit,
  reset,
  close,
}: {
  title: string;
  initial: Purchase;
  commit: (item: Purchase) => boolean;
  reset?: () => void;
  close: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [amount, setAmount] = useState(initial.amount?.toString() ?? "");
  const [unit, setUnit] = useState(initial.unit ?? "");
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    const result = purchaseSchema.safeParse({
      name,
      amount: amount === "" ? null : Number(amount),
      unit: unit || null,
    });
    if (!result.success) setError("Ange ett namn och en enhet om du fyller i en mängd.");
    else if (!commit(result.data)) setError("Varan kunde inte läggas till i utkastet.");
  }
  return (
    <PlanDialog title={title} description="Mängd är valfri." close={close}>
      <form onSubmit={submit}>
        <label>
          Vara
          <input
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="k-plan-field-row">
          <label>
            Mängd
            <input
              type="number"
              min={0}
              step="any"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label>
            Enhet
            <select
              value={unit}
              onChange={(event) => setUnit((event.target.value as Purchase["unit"]) ?? "")}
            >
              <option value="">Ingen</option>
              {units.map((value) => (
                <option key={value} value={value}>
                  {unitLabels[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="k-plan-actions">
          {reset && (
            <button type="button" className="k-secondary" onClick={reset}>
              Återställ receptmängd
            </button>
          )}
          <button type="submit" className="k-primary">
            Klar
          </button>
        </div>
      </form>
    </PlanDialog>
  );
}

type PlannerProps = {
  owner: string;
  online: boolean;
  recipes: RecipeVersion[];
  canCook: boolean;
  onCook: (version: RecipeVersion, servings: number) => Promise<boolean>;
  dinersEnabled?: boolean;
  active?: boolean;
  pantry?: {
    snapshot: PantrySnapshot | null | undefined;
    now: number;
    unavailable: boolean;
    open: () => void;
  };
};
type RecipeLine = Extract<
  ReturnType<typeof buildShoppingList>,
  { status: "ready" }
>["recipeItems"][number];
type EditLine = { kind: "manual"; id?: string } | { kind: "recipe"; key: string };

export function WeekPlanner(props: PlannerProps) {
  const [weekStart, setWeek] = useState(localWeek);
  return (
    <WeekWorkspace
      key={`${props.owner}:${weekStart}`}
      {...props}
      weekStart={weekStart}
      setWeek={setWeek}
    />
  );
}

function WeekWorkspace({
  owner,
  online,
  recipes,
  canCook,
  onCook,
  pantry,
  dinersEnabled,
  active,
  weekStart,
  setWeek,
}: PlannerProps & {
  weekStart: string;
  setWeek: (date: string) => void;
}) {
  const planner = useWeekPlan(owner, weekStart, online);
  const audience = useFreshData(
    (signal) => ownedPlanDiners(owner, signal),
    !!(dinersEnabled && active && online),
  );
  const { draft, dirty, busy, recovery, notice } = planner;
  const [view, setView] = useState<"meals" | "shopping">("meals");
  const [mealEditor, setMealEditor] = useState<MealEditor>();
  const [lineEditor, setLineEditor] = useState<EditLine>();
  const [starting, setStarting] = useState(false);
  const [cookError, setCookError] = useState("");
  const dates = weekDates(weekStart);
  const previous = neighboringWeek(weekStart, -1);
  const next = neighboringWeek(weekStart, 1);
  const versions = useMemo(
    () => [
      ...new Map(
        [...recipes, ...planner.versions].filter((v) => v.user_id === owner).map((v) => [v.id, v]),
      ).values(),
    ],
    [recipes, planner.versions, owner],
  );
  const byId = useMemo(() => new Map(versions.map((v) => [v.id, v])), [versions]);
  const dinersById = useMemo(
    () => new Map(audience.data?.map((diner) => [diner.id, diner.document.name])),
    [audience.data],
  );
  const shopping = useMemo(
    () => draft && buildShoppingList(owner, draft, versions),
    [draft, owner, versions],
  );
  const stock = pantry?.snapshot;
  const stockTime = pantry?.now;
  const pantrySuggestions = useMemo(
    () =>
      shopping && stock && stockTime !== undefined
        ? suggestPantryShopping(owner, shopping, stock, stockTime)
        : undefined,
    [owner, shopping, stock, stockTime],
  );
  const locked = !!(busy || recovery || starting);
  const weekLocked = locked || dirty || !!mealEditor || !!lineEditor;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function editMeal(nextMeals: PlannedMeal[]) {
    if (!draft) return false;
    const updated = { ...draft, meals: nextMeals };
    const parsed = weekPlanSchema.safeParse(updated);
    if (!parsed.success) return false;
    const result = buildShoppingList(owner, parsed.data, versions);
    if (result.status === "ready") {
      const kept = new Set(
        result.recipeItems
          .filter((line) => line.checked || line.excluded || line.adjustment)
          .map((line) => line.key),
      );
      updated.shoppingEdits = updated.shoppingEdits.filter(({ key }) => kept.has(key));
    }
    return planner.change(updated);
  }
  function setRecipeLine(
    line: RecipeLine,
    patch: Partial<Pick<RecipeLine, "checked" | "excluded" | "adjustment">>,
  ) {
    if (!draft) return false;
    const { key, basis, checked, excluded, adjustment } = line;
    const edit = { key, basis, checked, excluded, adjustment, ...patch };
    return planner.change({
      ...draft,
      shoppingEdits: [
        ...draft.shoppingEdits.filter((candidate) => candidate.key !== key),
        ...(edit.checked || edit.excluded || edit.adjustment ? [edit] : []),
      ],
    });
  }
  async function cook(version: RecipeVersion, servings: number) {
    if (locked || dirty || !online || !canCook) return;
    setStarting(true);
    setCookError("");
    try {
      if (!(await onCook(version, servings)))
        setCookError(
          "Matlagningen kunde inte startas. Kontrollera om du redan har en pågående matlagning.",
        );
    } catch {
      setCookError("Matlagningen kunde inte startas.");
    } finally {
      setStarting(false);
    }
  }
  const recipeLines = shopping?.status === "ready" ? shopping.recipeItems : [];
  const editedRecipe =
    lineEditor?.kind === "recipe"
      ? recipeLines.find((line) => line.key === lineEditor.key)
      : undefined;
  const editedManual =
    lineEditor?.kind === "manual"
      ? draft?.manualItems.find((line) => line.id === lineEditor.id)
      : undefined;
  return (
    <section className="k-week-plan" aria-label="Veckoplan">
      <header className="k-plan-heading">
        <h1>Veckoplan</h1>
        <div className="k-plan-week">
          <IconAction
            label="Föregående vecka"
            disabled={weekLocked || !previous}
            onClick={() => previous && setWeek(previous)}
          >
            <ChevronLeft size={18} />
          </IconAction>
          <span>
            {dayDate.format(calendarDate(dates[0]))} – {dayDate.format(calendarDate(dates[6]))}{" "}
            {dates[6].slice(0, 4)}
          </span>
          <IconAction
            label="Nästa vecka"
            disabled={weekLocked || !next}
            onClick={() => next && setWeek(next)}
          >
            <ChevronRight size={18} />
          </IconAction>
        </div>
      </header>
      {!online && (
        <p role="status">
          {draft
            ? "Du är offline. Spara utkastet när du har anslutning igen."
            : "Anslut för att hämta veckoplanen."}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {dirty && !busy && !recovery && !notice && online && <p role="status">Osparat utkast</p>}
      {cookError && <p role="alert">{cookError}</p>}
      {busy && (
        <p role="status">{busy === "read" ? "Hämtar veckoplanen…" : "Sparar veckoplanen…"}</p>
      )}
      {recovery && (
        <section className="k-conflict" aria-label="Återställ sparandet">
          <h2>
            {recovery.kind === "conflict"
              ? "Veckoplanen har ändrats"
              : "Sparandet är inte bekräftat"}
          </h2>
          <p>Ditt utkast finns kvar. Inget skickas igen automatiskt.</p>
          {!recovery.remote ? (
            <button
              className="k-secondary"
              disabled={!online || !!busy}
              onClick={() => void planner.read()}
            >
              Hämta sparad plan
            </button>
          ) : (
            <>
              <details>
                <summary>
                  Sparad plan: {recovery.remote.plan.meals.length} måltider,{" "}
                  {recovery.remote.plan.manualItems.length} egna varor
                </summary>
                <ul>
                  {recovery.remote.plan.meals.map((meal) => (
                    <li key={meal.date + meal.meal}>
                      {dayDate.format(calendarDate(meal.date))}, {meals[meal.meal]}:{" "}
                      {recovery.remote?.versions.find(
                        (version) => version.id === meal.recipeVersionId,
                      )?.document.title ?? "Receptet är inte tillgängligt"}
                      , {portionText(meal.servings)}
                    </li>
                  ))}
                  {recovery.remote.plan.manualItems.map(({ id, item }) => (
                    <li key={id}>
                      {item.name}, {amountText(item)}
                    </li>
                  ))}
                </ul>
              </details>
              <div className="k-plan-actions">
                <button className="k-secondary" onClick={() => planner.chooseRemote(false)}>
                  Använd sparad plan
                </button>
                <button className="k-secondary" onClick={() => planner.chooseRemote(true)}>
                  Behåll mitt utkast
                </button>
              </div>
            </>
          )}
        </section>
      )}
      {!draft && notice && !recovery && (
        <button
          className="k-secondary"
          disabled={!online || !!busy}
          onClick={() => void planner.read()}
        >
          Försök igen
        </button>
      )}
      {draft && (
        <>
          <div className="k-plan-toolbar">
            <div className="k-plan-segment" role="group" aria-label="Vy">
              <button
                type="button"
                aria-pressed={view === "meals"}
                onClick={() => setView("meals")}
              >
                Måltider
              </button>
              <button
                type="button"
                aria-pressed={view === "shopping"}
                onClick={() => setView("shopping")}
              >
                Inköpslista
              </button>
            </div>
            <div className="k-plan-actions">
              {dirty && (
                <button className="k-secondary" disabled={locked} onClick={planner.discard}>
                  Ångra utkast
                </button>
              )}
              <button
                className="k-primary"
                disabled={locked || !dirty || !online}
                onClick={() => void planner.save()}
              >
                <Check size={16} /> Spara vecka
              </button>
            </div>
          </div>
          {view === "meals" ? (
            <>
              {!versions.length && <p>Inga sparade recept i kokboken än.</p>}
              {dates.map((date) => {
                const planned = draft.meals
                  .filter((meal) => meal.date === date)
                  .sort((a, b) => mealSlots.indexOf(a.meal) - mealSlots.indexOf(b.meal));
                const calendar = calendarDate(date);
                return (
                  <section key={date} className="k-plan-day" aria-label={dayName.format(calendar)}>
                    <div className="k-plan-row">
                      <h2>
                        {dayName.format(calendar)} <span>{dayDate.format(calendar)}</span>
                      </h2>
                      <IconAction
                        label={`Lägg till måltid ${dayName.format(calendar)}`}
                        disabled={locked || !versions.length || planned.length === mealSlots.length}
                        onClick={() => setMealEditor({ date })}
                      >
                        <Plus size={18} />
                      </IconAction>
                    </div>
                    {planned.map((meal) => {
                      const version = byId.get(meal.recipeVersionId);
                      return (
                        <div className="k-plan-line k-plan-row" key={meal.meal}>
                          <div className="k-plan-info">
                            <span>
                              {meals[meal.meal]} · {portionText(meal.servings)}
                            </span>
                            <strong>{version?.document.title ?? "Receptversionen saknas"}</strong>
                            {dinersEnabled && meal.dinerIds?.length && (
                              <span>
                                Matgäster:{" "}
                                {audience.data
                                  ? meal.dinerIds
                                      .map((id) => dinersById.get(id) ?? "profil saknas")
                                      .join(", ")
                                  : meal.dinerIds.length + " valda"}
                              </span>
                            )}
                          </div>
                          <div className="k-plan-actions">
                            <IconAction
                              label="Starta planerad matlagning"
                              disabled={locked || dirty || !online || !canCook || !version}
                              onClick={() => version && void cook(version, meal.servings)}
                            >
                              <Play size={17} />
                            </IconAction>
                            <IconAction
                              label="Redigera måltid"
                              disabled={locked || !versions.length}
                              onClick={() => setMealEditor({ date, original: meal })}
                            >
                              <Pencil size={17} />
                            </IconAction>
                            <IconAction
                              label="Ta bort måltid"
                              disabled={locked}
                              onClick={() => editMeal(draft.meals.filter((item) => item !== meal))}
                            >
                              <Trash2 size={17} />
                            </IconAction>
                          </div>
                        </div>
                      );
                    })}
                  </section>
                );
              })}
            </>
          ) : (
            <>
              <section className="k-plan-shopping">
                <div className="k-plan-row">
                  <h2>Från veckoplanen</h2>
                  {pantry && (
                    <button type="button" className="k-secondary" onClick={pantry.open}>
                      <PackageOpen size={16} aria-hidden /> Skafferi
                    </button>
                  )}
                </div>
                {pantry?.unavailable && (
                  <p role="status">Skafferiet kunde inte läsas. Visar hela behovet.</p>
                )}
                {shopping?.status === "missing_recipes" ? (
                  <p role="status">
                    Inköpen kan inte räknas ut förrän alla planerade receptversioner är
                    tillgängliga.
                  </p>
                ) : !recipeLines.length ? (
                  <p>Inga receptvaror för veckan.</p>
                ) : null}
                {recipeLines
                  .filter((line) => !line.excluded)
                  .map((line) => {
                    const item = line.adjustment ?? {
                      name: line.name,
                      amount: line.basis.knownAmount,
                      unit: line.unit,
                    };
                    const suggestion = pantrySuggestions?.get(line.key);
                    return (
                      <div className="k-plan-line k-plan-row" key={line.key}>
                        <label className="k-plan-check">
                          <input
                            type="checkbox"
                            disabled={locked}
                            checked={line.checked}
                            onChange={(event) =>
                              setRecipeLine(line, { checked: event.target.checked })
                            }
                          />
                          <span className="k-plan-info">
                            <strong>{item.name}</strong>
                            <span>
                              {suggestion ? "Behövs: " : ""}
                              {amountText(item)}
                              {line.adjustment
                                ? " · Justerad"
                                : line.basis.knownAmount !== null && line.basis.unknownAmounts > 0
                                  ? " + okänd mängd"
                                  : ""}
                            </span>
                            {suggestion && (
                              <>
                                <span>
                                  Från skafferiet:{" "}
                                  {amountText({ amount: suggestion.covered, unit: line.unit })}
                                </span>
                                <strong className="k-plan-buy">
                                  {suggestion.toBuy > 0
                                    ? "Att köpa: " +
                                      amountText({ amount: suggestion.toBuy, unit: line.unit })
                                    : "Finns hemma"}
                                </strong>
                              </>
                            )}
                          </span>
                        </label>
                        <div className="k-plan-actions">
                          <IconAction
                            label={`Justera ${item.name}`}
                            disabled={locked}
                            onClick={() => setLineEditor({ kind: "recipe", key: line.key })}
                          >
                            <Pencil size={17} />
                          </IconAction>
                          <IconAction
                            label={`Dölj ${item.name}`}
                            disabled={locked}
                            onClick={() => setRecipeLine(line, { excluded: true })}
                          >
                            <EyeOff size={17} />
                          </IconAction>
                        </div>
                      </div>
                    );
                  })}
                {recipeLines.some((line) => line.excluded) && (
                  <details>
                    <summary>Dolda receptvaror</summary>
                    {recipeLines
                      .filter((line) => line.excluded)
                      .map((line) => (
                        <div className="k-plan-line k-plan-row" key={line.key}>
                          <div className="k-plan-info">{line.adjustment?.name ?? line.name}</div>
                          <IconAction
                            label={`Visa ${line.adjustment?.name ?? line.name}`}
                            disabled={locked}
                            onClick={() => setRecipeLine(line, { excluded: false })}
                          >
                            <Eye size={17} />
                          </IconAction>
                        </div>
                      ))}
                  </details>
                )}
              </section>
              <section className="k-plan-shopping">
                <div className="k-plan-row">
                  <h2>Egna varor</h2>
                  <IconAction
                    label="Lägg till vara"
                    disabled={locked || draft.manualItems.length >= 100}
                    onClick={() => setLineEditor({ kind: "manual" })}
                  >
                    <Plus size={18} />
                  </IconAction>
                </div>
                {draft.manualItems.map(({ id, item, checked }) => (
                  <div className="k-plan-line k-plan-row" key={id}>
                    <label className="k-plan-check">
                      <input
                        type="checkbox"
                        disabled={locked}
                        checked={checked}
                        onChange={(event) =>
                          planner.change({
                            ...draft,
                            manualItems: draft.manualItems.map((line) =>
                              line.id === id ? { ...line, checked: event.target.checked } : line,
                            ),
                          })
                        }
                      />
                      <span className="k-plan-info">
                        <strong>{item.name}</strong>
                        <span>{amountText(item)}</span>
                      </span>
                    </label>
                    <div className="k-plan-actions">
                      <IconAction
                        label={`Redigera ${item.name}`}
                        disabled={locked}
                        onClick={() => setLineEditor({ kind: "manual", id })}
                      >
                        <Pencil size={17} />
                      </IconAction>
                      <IconAction
                        label={`Ta bort ${item.name}`}
                        disabled={locked}
                        onClick={() =>
                          planner.change({
                            ...draft,
                            manualItems: draft.manualItems.filter((line) => line.id !== id),
                          })
                        }
                      >
                        <Trash2 size={17} />
                      </IconAction>
                    </div>
                  </div>
                ))}
              </section>
            </>
          )}
          {mealEditor && (
            <EditMeal
              editor={mealEditor}
              versions={versions}
              dayMeals={draft.meals.filter((meal) => meal.date === mealEditor.date)}
              audience={dinersEnabled && online ? audience : undefined}
              close={() => setMealEditor(undefined)}
              commit={(meal) => {
                const changed = editMeal([
                  ...draft.meals.filter((item) => item !== mealEditor.original),
                  meal,
                ]);
                if (changed) setMealEditor(undefined);
                return changed;
              }}
            />
          )}
          {lineEditor?.kind === "manual" && (
            <EditPurchase
              title={editedManual ? "Redigera vara" : "Lägg till vara"}
              initial={editedManual?.item ?? emptyPurchase}
              close={() => setLineEditor(undefined)}
              commit={(item) => {
                const changed = planner.change({
                  ...draft,
                  manualItems: editedManual
                    ? draft.manualItems.map((line) =>
                        line.id === editedManual.id ? { ...line, item } : line,
                      )
                    : [...draft.manualItems, { id: crypto.randomUUID(), item, checked: false }],
                });
                if (changed) setLineEditor(undefined);
                return changed;
              }}
            />
          )}
          {editedRecipe && (
            <EditPurchase
              title="Justera receptvara"
              initial={
                editedRecipe.adjustment ?? {
                  name: editedRecipe.name,
                  amount: editedRecipe.basis.knownAmount,
                  unit: editedRecipe.unit,
                }
              }
              close={() => setLineEditor(undefined)}
              reset={
                editedRecipe.adjustment
                  ? () => {
                      if (setRecipeLine(editedRecipe, { adjustment: null }))
                        setLineEditor(undefined);
                    }
                  : undefined
              }
              commit={(adjustment) => {
                const changed = setRecipeLine(editedRecipe, { adjustment });
                if (changed) setLineEditor(undefined);
                return changed;
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
