import { lazy, Suspense, useState, type FormEvent } from "react";
import { Download, Pencil, Trash2, X } from "lucide-react";
import type { RecipeVersion } from "../kitchen/domain";
import {
  journalConsentVersion,
  mealGoal,
  reading,
  readingInWindow,
  readingMethods,
  urineCategories,
  urineScale,
  type JournalCommand,
  type JournalState,
  type StoredReading,
} from "./domain";
import { enteredInstant, localTimeOffsets } from "./timestamp";
import { useJournal } from "./useJournal";
import "./journal.css";

const MealComparison = lazy(() =>
  import("../nutrition/NutritionPanel").then((m) => ({ default: m.PersonalMealComparison })),
);
const methods = { blood: "Blod", breath: "Utandning", urine: "Urin" } as const;
const units = { blood: "mmol/L", breath: "ppm", urine: "category" } as const;
const categories = {
  negative: "Negativ",
  trace: "Spår",
  small: "Liten",
  moderate: "Måttlig",
  large: "Stor",
};
type Run = (command: JournalCommand) => Promise<boolean>;
type Method = (typeof readingMethods)[number];

function Consent({
  feature,
  revision,
  run,
  busy,
}: {
  feature: "goal" | "readings";
  revision: string;
  run: Run;
  busy: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  const goal = feature === "goal";
  return (
    <div className="journal-consent">
      <p>
        {goal
          ? "Ditt eget kolhydratmål sparas på den här datorn tills du byter det, raderar det eller stänger av."
          : "Egna, manuellt uppmätta värden är tillgängliga i högst 90 dagar från mättiden. När du stänger av raderas alla mätvärden."}
      </p>
      <p>Uppgifterna delas inte med familjen eller AI. Du kan exportera eller radera dem här.</p>
      {!goal && <p>Journalen är inte avsedd för diagnos, behandling eller medicinska beslut.</p>}
      <label className="journal-choice">
        <input
          type="checkbox"
          checked={accepted}
          disabled={busy}
          onChange={(event) => setAccepted(event.target.checked)}
        />
        {goal
          ? "Jag är vuxen och vill spara mitt eget mål."
          : "Jag är vuxen och vill spara mina egna mätvärden."}
      </label>
      <button
        type="button"
        className="k-primary"
        disabled={busy || !accepted}
        onClick={() =>
          void run({ action: "enable", feature, revision, notice: journalConsentVersion })
        }
      >
        {goal ? "Aktivera måltidsmål" : "Aktivera journal"}
      </button>
    </div>
  );
}

function GoalForm({ state, run, busy }: { state: JournalState; run: Run; busy: boolean }) {
  const [grams, setGrams] = useState(state.goal?.grams.replace(".", ",") ?? "");
  const [period, setPeriod] = useState(state.goal?.period ?? "meal");
  const [invalid, setInvalid] = useState(false);
  const revision = state.goalChoice.revision;
  function save(event: FormEvent) {
    event.preventDefault();
    const input = mealGoal.safeParse({ grams: grams.trim().replace(",", "."), period });
    setInvalid(!input.success);
    if (input.success) void run({ action: "setGoal", revision, goal: input.data });
  }
  return (
    <form className="journal-form" onSubmit={save}>
      <fieldset disabled={busy}>
        <label>
          Tillgängliga kolhydrater (g)
          <input
            inputMode="decimal"
            autoComplete="off"
            required
            value={grams}
            maxLength={8}
            onChange={(event) => setGrams(event.target.value)}
          />
        </label>
        <label>
          Period
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value === "day" ? "day" : "meal")}
          >
            <option value="meal">Per måltid</option>
            <option value="day">Per dag</option>
          </select>
        </label>
        {invalid && <p role="alert">Ange ett tal större än noll, med högst tre decimaler.</p>}
        <div className="journal-actions">
          <button type="submit" className="k-primary">
            Spara mål
          </button>
          {state.goal && (
            <button
              type="button"
              className="k-secondary"
              onClick={() => void run({ action: "deleteGoal", revision })}
            >
              <Trash2 size={17} aria-hidden /> Radera målet
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}

function ReadingForm({
  method,
  editing,
  submit,
  cancel,
  busy,
}: {
  method: Method;
  editing?: StoredReading;
  submit: (reading: StoredReading["reading"]) => Promise<boolean>;
  cancel: () => void;
  busy: boolean;
}) {
  const [wall, setWall] = useState(editing?.reading.at.slice(0, 19) ?? "");
  const [offset, setOffset] = useState(
    editing?.reading.at.slice(19).replace(/^Z$/, "+00:00") ?? "",
  );
  const [value, setValue] = useState(editing?.reading.value.replace(".", ",") ?? "");
  const [error, setError] = useState("");
  const offsets = localTimeOffsets(wall);
  if (editing && wall === editing.reading.at.slice(0, 19) && offset && !offsets.includes(offset))
    offsets.push(offset);
  const chosen = offsets.length === 1 ? offsets[0] : offsets.includes(offset) ? offset : "";
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = reading.safeParse({
      method,
      unit: units[method],
      at: enteredInstant(wall, chosen),
      value: value.trim().replace(",", "."),
      ...(method === "urine" ? { scale: urineScale } : {}),
    });
    if (!parsed.success || !readingInWindow(parsed.data)) {
      setError("Kontrollera värde, enhet och tid. Tiden måste ligga inom de senaste 90 dagarna.");
      return;
    }
    setError("");
    if (await submit(parsed.data)) {
      setValue("");
      setWall("");
      setOffset("");
    }
  }
  return (
    <form className="journal-form" onSubmit={(event) => void save(event)}>
      <fieldset disabled={busy}>
        <legend>{editing ? "Ändra mätvärde" : "Nytt mätvärde"}</legend>
        <label>
          {method === "urine"
            ? "Avläst kategori (Ketostix, acetoacetat)"
            : `Avläst värde (${units[method]})`}
          {method === "urine" ? (
            <select value={value} onChange={(event) => setValue(event.target.value)} required>
              <option value="">Välj kategori</option>
              {urineCategories.map((category) => (
                <option key={category} value={category}>
                  {categories[category]}
                </option>
              ))}
            </select>
          ) : (
            <input
              inputMode="decimal"
              autoComplete="off"
              value={value}
              maxLength={10}
              onChange={(event) => setValue(event.target.value)}
              required
            />
          )}
        </label>
        <label>
          Mättid
          <input
            type="datetime-local"
            required
            step={1}
            value={wall}
            onChange={(event) => {
              setWall(event.target.value);
              setOffset("");
            }}
          />
        </label>
        {offsets.length > 1 && (
          <label>
            Tidsförskjutning vid mätningen
            <select value={chosen} onChange={(event) => setOffset(event.target.value)} required>
              <option value="">Välj vilken tid som avses</option>
              {offsets.map((option) => (
                <option key={option} value={option}>
                  UTC{option}
                </option>
              ))}
            </select>
          </label>
        )}
        {chosen && <p className="journal-muted">UTC{chosen}</p>}
        {wall && !offsets.length && <p role="alert">Tiden finns inte i enhetens tidszon.</p>}
        {error && <p role="alert">{error}</p>}
        <div className="journal-actions">
          <button type="submit" className="k-primary" disabled={!!wall && !chosen}>
            Spara mätvärde
          </button>
          {editing && (
            <button type="button" className="k-secondary" onClick={cancel}>
              <X size={17} aria-hidden /> Avbryt
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}

function Readings({ state, run, busy }: { state: JournalState; run: Run; busy: boolean }) {
  const [method, setMethod] = useState<Method>("blood");
  const [editId, setEditId] = useState("");
  const readings = state.readings.filter((entry) => entry.reading.method === method);
  const editing = readings.find(({ id }) => id === editId);
  const revision = state.readingsChoice.revision;
  return (
    <>
      <fieldset className="journal-methods" disabled={busy}>
        <legend>Mätmetod</legend>
        {readingMethods.map((key) => (
          <label key={key}>
            <input
              type="radio"
              name="journal-method"
              checked={method === key}
              onChange={() => {
                setMethod(key);
                setEditId("");
              }}
            />
            {methods[key]}
          </label>
        ))}
      </fieldset>
      <ReadingForm
        key={(editing?.id ?? "new") + method}
        method={method}
        editing={editing}
        busy={busy}
        cancel={() => setEditId("")}
        submit={async (reading) => {
          const okay = await run(
            editing
              ? {
                  action: "editReading",
                  revision,
                  id: editing.id,
                  entryRevision: editing.revision,
                  reading,
                }
              : { action: "addReading", revision, reading },
          );
          if (okay) setEditId("");
          return okay;
        }}
      />
      <h3>{methods[method]} · Historik</h3>
      {!readings.length && <p className="journal-muted">Inga sparade mätvärden för metoden.</p>}
      <ul className="journal-history">
        {readings.map(({ id, revision: entryRevision, reading: item }) => (
          <li key={id}>
            <div>
              <strong>
                {item.method === "urine"
                  ? categories[item.value]
                  : `${item.value.replace(".", ",")} ${item.unit}`}
              </strong>
              <time dateTime={item.at}>
                {item.at.slice(0, 19).replace("T", " ")} (UTC
                {item.at.slice(19).replace(/^Z$/, "+00:00")})
              </time>
              <span>Manuell mätning</span>
            </div>
            <div className="journal-actions">
              <button
                type="button"
                className="k-icon"
                title="Ändra mätvärde"
                aria-label="Ändra mätvärde"
                onClick={() => setEditId(id)}
                disabled={busy}
              >
                <Pencil size={18} />
              </button>
              <button
                type="button"
                className="k-icon"
                title="Radera mätvärde"
                aria-label="Radera mätvärde"
                onClick={() => void run({ action: "deleteReading", revision, id, entryRevision })}
                disabled={busy}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function PrivateJournalPanel({
  owner,
  offline,
  versions,
}: {
  owner: string;
  offline: boolean;
  versions: RecipeVersion[];
}) {
  const { state, maintenancePaused, busy, error, run } = useJournal(owner, offline);
  return (
    <section className="journal" aria-labelledby="journal-heading">
      <h1 id="journal-heading">Mål och mätningar</h1>
      {offline ? (
        <p role="status">Den privata vyn fungerar bara online på den här datorn.</p>
      ) : !state ? (
        <>
          {error ? <p role="alert">{error}</p> : <p role="status">Öppnar den privata vyn…</p>}
          {error && (
            <button
              type="button"
              className="k-secondary"
              disabled={busy}
              onClick={() => void run({ action: "read" })}
            >
              Läs om
            </button>
          )}
        </>
      ) : (
        <>
          {maintenancePaused && (
            <div>
              <p role="status">Dina värden är tillfälligt dolda i väntan på lokalt underhåll.</p>
              <button
                type="button"
                className="k-secondary"
                disabled={busy}
                onClick={() => void run({ action: "read" })}
              >
                Läs om
              </button>
            </div>
          )}
          <section aria-labelledby="journal-goal">
            <h2 id="journal-goal">Måltidsmål</h2>
            {state.goalChoice.enabled ? (
              <>
                {!maintenancePaused && (
                  <GoalForm key={state.goalChoice.revision} state={state} run={run} busy={busy} />
                )}
                {state.goal?.period === "day" && (
                  <p className="journal-muted">Ingen verifierad dagssumma att jämföra med.</p>
                )}
                {state.goal?.period === "meal" && (
                  <Suspense fallback={null}>
                    <MealComparison
                      key={state.goalChoice.revision}
                      goal={state.goal}
                      versions={versions}
                    />
                  </Suspense>
                )}
                <button
                  type="button"
                  className="k-secondary"
                  disabled={busy}
                  onClick={() =>
                    void run({
                      action: "disable",
                      feature: "goal",
                      revision: state.goalChoice.revision,
                    })
                  }
                >
                  Stäng av och radera målet
                </button>
              </>
            ) : maintenancePaused ? (
              <p className="journal-muted">Avstängt</p>
            ) : (
              <Consent feature="goal" revision={state.goalChoice.revision} run={run} busy={busy} />
            )}
          </section>
          <section aria-labelledby="journal-readings">
            <h2 id="journal-readings">Privat ketonjournal</h2>
            {state.readingsChoice.enabled ? (
              <>
                {!maintenancePaused && (
                  <Readings
                    key={state.readingsChoice.revision}
                    state={state}
                    run={run}
                    busy={busy}
                  />
                )}
                <button
                  type="button"
                  className="k-secondary"
                  disabled={busy}
                  onClick={() =>
                    void run({
                      action: "disable",
                      feature: "readings",
                      revision: state.readingsChoice.revision,
                    })
                  }
                >
                  Stäng av och radera journalen
                </button>
              </>
            ) : maintenancePaused ? (
              <p className="journal-muted">Avstängt</p>
            ) : (
              <Consent
                feature="readings"
                revision={state.readingsChoice.revision}
                run={run}
                busy={busy}
              />
            )}
          </section>
          {!maintenancePaused && (state.goalChoice.enabled || state.readingsChoice.enabled) && (
            <section>
              <button
                type="button"
                className="k-secondary"
                disabled={busy}
                onClick={() => void run("export", state)}
              >
                <Download size={18} aria-hidden /> Exportera privata uppgifter
              </button>
              <p className="journal-muted">En sparad fil är en separat kopia.</p>
            </section>
          )}
        </>
      )}
    </section>
  );
}
