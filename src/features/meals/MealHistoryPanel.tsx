import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import type { LocalSession } from "../kitchen/domain";
import { cellarWines, mealHistory, mealSave } from "./api";
import { mealInputSchema, type Meal } from "./domain";
import { useFreshData } from "./useFreshData";
import "./meals.css";

export function MealHistoryPanel({
  owner,
  sessions,
  initialSession,
}: {
  owner: string;
  sessions: LocalSession[];
  initialSession?: string;
}) {
  const { data, error, refresh } = useFreshData(async () => ({
    cellar: await cellarWines(owner),
    history: await mealHistory(owner),
  }));
  const [editing, setEditing] = useState<{
      id: string;
      revision: number;
      sessionId: string;
      wineId: string;
      wineRating: number | null;
      pairingRating: number | null;
      note: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [confirm, setConfirm] = useState("");
  const completed = sessions.filter((s) => s.state.status === "completed" && !s.dirty);
  const unregistered = completed.filter(
    (s) => !data?.history.meals.some((m) => m.session_id === s.id),
  );
  const edit = (m?: Meal) =>
    setEditing(
      m
        ? {
            id: m.id,
            revision: m.revision,
            sessionId: m.session_id,
            wineId: m.wine_id,
            wineRating: m.wine_rating,
            pairingRating: m.pairing_rating,
            note: m.note,
          }
        : {
            id: crypto.randomUUID(),
            revision: 0,
            sessionId:
              unregistered.find((s) => s.id === initialSession)?.id ?? unregistered[0]?.id ?? "",
            wineId: data?.cellar.wines[0]?.id ?? "",
            wineRating: null,
            pairingRating: null,
            note: "",
          },
    );
  async function save(remove = false) {
    if (!editing) return;
    setBusy(true);
    setNotice("");
    try {
      const { id, revision, ...input } = editing;
      await mealSave(owner, id, revision, remove ? null : mealInputSchema.parse(input));
      setEditing(null);
      setConfirm("");
      await refresh();
      setNotice(
        remove
          ? "Måltidskopplingen raderades."
          : "Måltiden sparades. Inget smakminne eller flaskantal har ändrats.",
      );
    } catch {
      setNotice(
        "Kunde inte spara. Kontrollera valen och hämta aktuella uppgifter. Skriv inte hälsouppgifter i anteckningen.",
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="meal-panel">
      <div className="k-title-row">
        <div>
          <p className="k-eyebrow">Dina kombinationer</p>
          <h1>Måltider & vin</h1>
        </div>
        <button
          className="k-secondary"
          disabled={!data || !unregistered.length || busy || !data.cellar.wines.length}
          onClick={() => edit()}
        >
          <Plus size={18} />
          Registrera
        </button>
      </div>
      <p>
        Vinbetyg för vuxna. Mat, vin och kombination bedöms var för sig. Ingen automatisk inlärning
        eller ändring av flaskantal.
      </p>
      {error && (
        <p role="alert" className="k-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {data && (
        <>
          {!completed.length && <p>Slutför en matlagning för att registrera en kombination.</p>}
          {data.history.truncated && <p>Visar de senaste 50 registreringarna.</p>}
          {editing && (
            <form
              className="meal-editor"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <fieldset disabled={busy}>
                <legend>{editing.revision ? "Redigera måltid" : "Registrera måltid"}</legend>
                <label>
                  Avslutad matlagning
                  <select
                    required
                    disabled={editing.revision > 0}
                    value={editing.sessionId}
                    onChange={(e) => setEditing({ ...editing, sessionId: e.target.value })}
                  >
                    {!completed.some((s) => s.id === editing.sessionId) && editing.sessionId && (
                      <option value={editing.sessionId}>Tidigare matlagning</option>
                    )}
                    {(editing.revision ? completed : unregistered).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.version.document.title} · version {s.version.revision}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Vin
                  <select
                    required
                    value={editing.wineId}
                    onChange={(e) => setEditing({ ...editing, wineId: e.target.value })}
                  >
                    {!data.cellar.wines.some((w) => w.id === editing.wineId) && editing.wineId && (
                      <option value={editing.wineId}>Tidigare valt vin</option>
                    )}
                    {data.cellar.wines.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.wine_name ?? "Namnlöst vin"} {w.vintage ?? ""}
                      </option>
                    ))}
                  </select>
                </label>
                <Rating
                  label="Vinbetyg"
                  value={editing.wineRating}
                  onChange={(v) => setEditing({ ...editing, wineRating: v })}
                />
                <Rating
                  label="Kombinationens betyg"
                  value={editing.pairingRating}
                  onChange={(v) => setEditing({ ...editing, pairingRating: v })}
                />
                <label>
                  Anteckning
                  <textarea
                    maxLength={500}
                    value={editing.note}
                    onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                  />
                </label>
                <div className="k-actions">
                  <button className="k-primary" type="submit">
                    <Check size={18} />
                    Spara måltid
                  </button>
                  <button type="button" className="k-secondary" onClick={() => setEditing(null)}>
                    Avbryt
                  </button>
                  {editing.revision > 0 && (
                    <button type="button" className="k-text" onClick={() => setConfirm(editing.id)}>
                      <Trash2 size={18} />
                      Radera koppling
                    </button>
                  )}
                </div>
                {confirm === editing.id && (
                  <button type="button" className="k-secondary" onClick={() => void save(true)}>
                    Bekräfta radering
                  </button>
                )}
              </fieldset>
            </form>
          )}
          <ul className="meal-results">
            {data.history.meals.map((m) => (
              <li key={m.id}>
                <h2>{data.history.titles[m.session_id] ?? "Tidigare måltid"}</h2>
                <p>
                  {data.history.wineNames[m.wine_id] ?? "Tidigare valt vin"} ·{" "}
                  {new Date(m.created_at).toLocaleDateString("sv-SE")}
                </p>
                <dl className="meal-ratings">
                  <dt>Mat</dt>
                  <dd>{m.food_rating === null ? "Inte betygsatt" : `${m.food_rating}/5`}</dd>
                  <dt>Vin</dt>
                  <dd>{m.wine_rating === null ? "Inte betygsatt" : `${m.wine_rating}/5`}</dd>
                  <dt>Kombination</dt>
                  <dd>{m.pairing_rating === null ? "Inte betygsatt" : `${m.pairing_rating}/5`}</dd>
                </dl>
                {m.note && <p>{m.note}</p>}
                <button className="k-text" disabled={busy} onClick={() => edit(m)}>
                  Redigera måltid
                </button>
              </li>
            ))}
          </ul>
          {!data.history.meals.length && <p>Inga kombinationer registrerade ännu.</p>}
        </>
      )}
    </section>
  );
}
function Rating({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">Inte betygsatt</option>
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n} av 5
          </option>
        ))}
      </select>
    </label>
  );
}
