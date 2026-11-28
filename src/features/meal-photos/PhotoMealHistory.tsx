import { useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { listPhotoMeals, photoMealPageSize, readMealPhoto, removeMealPhoto } from "./client";
import { portionText, type SavedPhotoMeal } from "./domain";

const dateLabel = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

function HistoryMeal({
  meal,
  owner,
  offline,
}: {
  meal: SavedPhotoMeal;
  owner: string;
  offline: boolean;
}) {
  const pending = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [photoState, setPhotoState] = useState(meal.photo_state);
  const [notice, setNotice] = useState("");
  const hasPhoto = photoState === "pending" || photoState === "ready" || photoState === "removing";

  useEffect(() => {
    return () => {
      pending.current?.abort();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  function hide() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    setSrc(null);
  }

  async function request(action: "show" | "remove") {
    if (offline || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const current = () => pending.current === controller && !controller.signal.aborted;
    const scope = { owner, current };
    setBusy(true);
    setNotice("");
    try {
      if (action === "show") {
        const image = await readMealPhoto(meal.id, scope, controller.signal);
        if (!current()) return;
        objectUrl.current = URL.createObjectURL(image);
        setSrc(objectUrl.current);
      } else {
        hide();
        setPhotoState("removing");
        await removeMealPhoto(meal.id, scope, controller.signal);
        if (!current()) return;
        setPhotoState("removed");
        setConfirm(false);
      }
    } catch {
      if (current())
        setNotice(
          action === "show"
            ? "Bilden kunde inte visas. Försök igen."
            : "Borttagningen kunde inte bekräftas. Försök igen.",
        );
    } finally {
      if (current()) {
        pending.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <li className="meal-photo-history-entry">
      <time dateTime={meal.created_at}>{dateLabel.format(new Date(meal.created_at))}</time>
      <ul className="meal-photo-summary">
        {meal.items.map((item, index) => (
          <li key={index}>
            <strong>{item.name}</strong>
            <span>{portionText(item.portion)}</span>
          </li>
        ))}
      </ul>
      {src && <img className="meal-photo-preview" src={src} alt="Sparad måltidsbild" />}
      {photoState === "pending" && (
        <p className="meal-photo-detail">Bildsparandet är inte klart.</p>
      )}
      {photoState === "removing" && (
        <p className="meal-photo-detail">Borttagningen är inte klar.</p>
      )}
      {photoState === "removed" && <p className="meal-photo-detail">Bilden är borttagen.</p>}
      {notice && <p role="alert">{notice}</p>}
      {busy && <p role="status">{confirm ? "Tar bort bilden…" : "Hämtar bilden…"}</p>}
      {hasPhoto && (
        <div className="meal-photo-actions">
          {confirm ? (
            <>
              <p>Ta bort bilden permanent? Måltiden finns kvar.</p>
              <button
                type="button"
                className="k-secondary"
                disabled={busy || offline}
                onClick={() => void request("remove")}
              >
                <Trash2 size={17} aria-hidden /> Bekräfta borttagning
              </button>
              <button
                type="button"
                className="k-text"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                Stäng
              </button>
            </>
          ) : (
            <>
              {photoState === "ready" && (
                <button
                  type="button"
                  className="k-secondary"
                  disabled={busy || (offline && !src)}
                  onClick={() => (src ? hide() : void request("show"))}
                >
                  {src ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
                  {src ? "Dölj bild" : "Visa bild"}
                </button>
              )}
              <button
                type="button"
                className="k-secondary"
                disabled={offline || busy}
                onClick={() => setConfirm(true)}
              >
                <Trash2 size={17} aria-hidden /> Ta bort bild
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function PhotoMealHistory({
  owner,
  offline,
  version,
}: {
  owner: string;
  offline: boolean;
  version: number;
}) {
  return <HistoryList key={`${owner}:${version}`} owner={owner} offline={offline} />;
}

function HistoryList({ owner, offline }: { owner: string; offline: boolean }) {
  const heading = useId();
  const [meals, setMeals] = useState<SavedPhotoMeal[]>([]);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [more, setMore] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    if (offline) return;
    const controller = new AbortController();
    const current = () => !controller.signal.aborted;
    setStatus("loading");
    void listPhotoMeals({ owner, current }, controller.signal, offset)
      .then((records) => {
        if (!current()) return;
        setMeals((prev) => {
          const known = new Set(prev.map((item) => item.id));
          return offset ? [...prev, ...records.filter((item) => !known.has(item.id))] : records;
        });
        setMore(records.length === photoMealPageSize);
        setStatus("ready");
      })
      .catch(() => {
        if (current()) setStatus("error");
      });
    return () => controller.abort();
  }, [offline, owner, offset, refresh]);
  return (
    <section className="meal-photo-history" aria-labelledby={heading}>
      <h2 id={heading}>Sparade fotomåltider</h2>
      {offline ? (
        <p role="status">Offline. Anslut för att hämta sparade måltider och bilder.</p>
      ) : status === "loading" ? (
        <p role="status">Hämtar måltider…</p>
      ) : status === "error" ? (
        <div className="meal-photo-actions">
          <p role="alert">Sparade måltider kunde inte hämtas.</p>
          <button
            type="button"
            className="k-secondary"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Försök igen
          </button>
        </div>
      ) : !meals.length ? (
        <p>Inga sparade fotomåltider än.</p>
      ) : null}
      <ul className="meal-photo-history-list">
        {meals.map((meal) => (
          <HistoryMeal key={meal.id} meal={meal} owner={owner} offline={offline} />
        ))}
      </ul>
      {more && status === "ready" && (
        <button
          type="button"
          className="k-secondary"
          disabled={offline}
          onClick={() => setOffset((value) => value + photoMealPageSize)}
        >
          Visa fler måltider
        </button>
      )}
    </section>
  );
}
