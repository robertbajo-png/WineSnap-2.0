import { useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff, ImagePlus, RotateCcw, Save, Trash2 } from "lucide-react";
import {
  attachMealPhoto,
  listPhotoMeals,
  mealPhotoAccept,
  MealPhotoError,
  photoMealPageSize,
  prepareMealPhoto,
  readMealPhoto,
  removeMealPhoto,
  resumeMealPhoto,
} from "./client";
import { portionText, type SavedPhotoMeal } from "./domain";

const dateLabel = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const progressText = {
  show: "Hämtar bilden…",
  resume: "Kontrollerar den sparade bilden…",
  upload: "Sparar bilden…",
  remove: "Tar bort bilden…",
};
type PhotoAction = keyof typeof progressText;

function errorText(action: PhotoAction, error: unknown) {
  const code = error instanceof MealPhotoError ? error.code : null;
  if (code === "auth") return "Inloggningen kunde inte verifieras. Logga in och försök igen.";
  if (action === "show") return "Bilden kunde inte visas. Försök igen.";
  if (action === "remove") return "Borttagningen kunde inte bekräftas. Försök igen.";
  if (action === "resume") return "Bildsparandet kunde inte kontrolleras. Försök igen.";
  if (code === "format" || code === "read") return "Bilden kunde inte läsas. Välj en annan fil.";
  if (code === "conflict") return "Bilden stämmer inte med den tidigare uppladdningen.";
  return "Det gick inte att spara bilden. Försök igen.";
}

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
  const fileInput = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState<PhotoAction | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [photoState, setPhotoState] = useState(meal.photo_state);
  const [needsFile, setNeedsFile] = useState(false);
  const [file, setFile] = useState<File | null>(null);
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

  async function request(action: PhotoAction) {
    if (offline || pending.current) return;
    if (action === "upload" && !file) return;
    const controller = new AbortController();
    pending.current = controller;
    const current = () => pending.current === controller && !controller.signal.aborted;
    const scope = { owner, current };
    setBusy(action);
    setNotice("");
    try {
      if (action === "show") {
        const image = await readMealPhoto(meal.id, scope, controller.signal);
        if (!current()) return;
        objectUrl.current = URL.createObjectURL(image);
        setSrc(objectUrl.current);
      } else if (action === "remove") {
        hide();
        setFile(null);
        setPhotoState("removing");
        await removeMealPhoto(meal.id, scope, controller.signal);
        if (!current()) return;
        setPhotoState("removed");
        setConfirm(false);
      } else if (action === "resume") {
        const state = await resumeMealPhoto(meal.id, scope, controller.signal);
        if (!current()) return;
        setPhotoState(state);
        setNeedsFile(state === "pending");
        if (state === "ready") setFile(null);
      } else if (file) {
        const prepared = await prepareMealPhoto(file, controller.signal);
        if (!current()) return;
        await attachMealPhoto(meal.id, prepared, scope, controller.signal);
        if (!current()) return;
        setFile(null);
        setNeedsFile(false);
        setPhotoState("ready");
      }
    } catch (error) {
      if (current()) setNotice(errorText(action, error));
    } finally {
      if (current()) {
        pending.current = null;
        setBusy(null);
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
      {photoState === "pending" &&
        (needsFile ? (
          <p className="meal-photo-detail" role="status">
            Ingen färdig bild hittades. Välj samma bild igen eller lämna måltiden utan bild.
          </p>
        ) : (
          <p className="meal-photo-detail">Bildsparandet är inte klart.</p>
        ))}
      {photoState === "ready" && meal.photo_state === "pending" && (
        <p role="status">Bilden är sparad.</p>
      )}
      {photoState === "removing" && (
        <p className="meal-photo-detail">Borttagningen är inte klar.</p>
      )}
      {photoState === "removed" && <p className="meal-photo-detail">Bilden är borttagen.</p>}
      {notice && <p role="alert">{notice}</p>}
      {busy && <p role="status">{progressText[busy]}</p>}
      {file && photoState === "pending" && !confirm && (
        <p className="meal-photo-detail">Vald bild: {file.name}</p>
      )}
      {hasPhoto && (
        <div className="meal-photo-actions">
          {confirm ? (
            <>
              <p>
                {photoState === "pending"
                  ? "Avsluta bildsparandet och behåll måltiden utan bild?"
                  : "Ta bort bilden permanent? Måltiden finns kvar."}
              </p>
              <button
                type="button"
                className="k-secondary"
                disabled={!!busy || offline}
                onClick={() => void request("remove")}
              >
                <Trash2 size={17} aria-hidden /> Bekräfta borttagning
              </button>
              <button
                type="button"
                className="k-text"
                disabled={!!busy}
                onClick={() => setConfirm(false)}
              >
                Stäng
              </button>
            </>
          ) : (
            <>
              {photoState === "pending" && (
                <>
                  <button
                    type="button"
                    className="k-secondary"
                    disabled={!!busy || offline}
                    onClick={() => void request("resume")}
                  >
                    <RotateCcw size={17} aria-hidden /> Slutför bildsparandet
                  </button>
                  {needsFile && (
                    <>
                      <input
                        ref={fileInput}
                        type="file"
                        hidden
                        accept={mealPhotoAccept}
                        aria-label="Välj samma måltidsbild"
                        onChange={(event) => {
                          const selected = event.currentTarget.files?.[0];
                          event.currentTarget.value = "";
                          if (selected && !pending.current && !offline) {
                            setNotice("");
                            setFile(selected);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="k-secondary"
                        disabled={!!busy || offline}
                        onClick={() => fileInput.current?.click()}
                      >
                        <ImagePlus size={17} aria-hidden /> Välj bilden igen
                      </button>
                      {file && (
                        <button
                          type="button"
                          className="k-primary"
                          disabled={!!busy || offline}
                          onClick={() => void request("upload")}
                        >
                          <Save size={17} aria-hidden /> Spara vald bild
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
              {photoState === "ready" && (
                <button
                  type="button"
                  className="k-secondary"
                  disabled={!!busy || (offline && !src)}
                  onClick={() => (src ? hide() : void request("show"))}
                >
                  {src ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
                  {src ? "Dölj bild" : "Visa bild"}
                </button>
              )}
              <button
                type="button"
                className="k-secondary"
                disabled={offline || !!busy}
                onClick={() => setConfirm(true)}
              >
                <Trash2 size={17} aria-hidden />{" "}
                {photoState === "pending" ? "Behåll måltiden utan bild" : "Ta bort bild"}
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
