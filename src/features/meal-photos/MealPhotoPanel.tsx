import { useEffect, useId, useRef, useState } from "react";
import { Check, ImagePlus, Plus, ScanLine, Trash2, X } from "lucide-react";
import {
  analyzeMealPhoto,
  mealPhotoAccept,
  MealPhotoError,
  prepareMealPhoto,
  type PreparedMealPhoto,
} from "./client";
import {
  confirmedPhotoMealSchema,
  openPhotoMealReview,
  renamePhotoMealItem,
  type ConfirmedPhotoMeal,
  type PhotoMealReviewItem,
} from "./domain";
import "./meal-photos.css";

type DraftRow = {
  id: number;
  item: PhotoMealReviewItem;
  enteredGrams?: string;
  uncertain?: boolean;
};
type OperationKind = "preparing" | "analyzing";
const errors: Record<MealPhotoError["code"], string> = {
  format: "Välj en JPG-, PNG- eller WebP-bild på högst 16 MB.",
  read: "Bilden gick inte att läsa. Prova en annan bild.",
  auth: "Kontot kunde inte verifieras. Logga in och försök igen.",
  quota: "För många analyser just nu. Vänta en stund och försök igen.",
  disabled: "Bildanalysen är inte tillgänglig i den här installationen.",
  invalid: "Analysen gav inget användbart svar. Du kan försöka igen eller kasta bilden.",
};

function portionText(portion: PhotoMealReviewItem["portion"]) {
  if (!portion) return "Okänd mängd";
  return portion.source === "manual"
    ? `${portion.grams} g (angivet manuellt)`
    : `Ca ${portion.range.minGrams}\u2013${portion.range.maxGrams} g (från bild)`;
}

function photoReview(rows: DraftRow[]) {
  const items = rows.map(({ item, enteredGrams }) => {
    if (enteredGrams === undefined) return item;
    const value = enteredGrams.trim();
    return {
      ...item,
      portion: value
        ? { source: "manual", grams: /^\d{1,5}$/.test(value) ? Number(value) : NaN }
        : null,
    };
  });
  return confirmedPhotoMealSchema.safeParse({ items, keepPhoto: false });
}

export function MealPhotoPanel({ owner, offline }: { owner: string; offline: boolean }) {
  const heading = useId();
  const disclosure = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const pending = useRef<{ controller: AbortController; kind: OperationKind } | null>(null);
  const objectUrl = useRef<string | null>(null);
  const nextId = useRef(0);
  const [photo, setPhoto] = useState<(PreparedMealPhoto & { src: string }) | null>(null);
  const [busy, setBusy] = useState<OperationKind | null>(null);
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedPhotoMeal | null>(null);
  const [notice, setNotice] = useState("");
  const clearUrl = () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  };

  useEffect(() => {
    mounted.current = true;
    const disconnect = () => {
      if (pending.current?.kind !== "analyzing") return;
      pending.current.controller.abort();
      pending.current = null;
      setBusy(null);
      setNotice("Anslutningen bröts. Inget har sparats.");
    };
    window.addEventListener("offline", disconnect);
    return () => {
      mounted.current = false;
      pending.current?.controller.abort();
      pending.current = null;
      clearUrl();
      window.removeEventListener("offline", disconnect);
    };
  }, [owner]);

  function stop() {
    pending.current?.controller.abort();
    pending.current = null;
    setBusy(null);
  }

  function discard() {
    stop();
    clearUrl();
    setPhoto(null);
    setRows(null);
    setConfirmed(null);
    setNotice("");
  }

  function start(kind: OperationKind) {
    const controller = new AbortController();
    pending.current = { controller, kind };
    setBusy(kind);
    setNotice("");
    const current = () =>
      mounted.current &&
      ownerRef.current === owner &&
      pending.current?.controller === controller &&
      !controller.signal.aborted;
    const finish = () => {
      if (!current()) return;
      pending.current = null;
      setBusy(null);
    };
    return { signal: controller.signal, current, finish };
  }

  async function choose(file: File) {
    discard();
    const attempt = start("preparing");
    try {
      const prepared = await prepareMealPhoto(file, attempt.signal);
      if (!attempt.current()) return;
      const src = URL.createObjectURL(prepared.preview);
      objectUrl.current = src;
      setPhoto({ ...prepared, src });
    } catch (cause) {
      if (attempt.current())
        setNotice(errors[cause instanceof MealPhotoError ? cause.code : "read"]);
    } finally {
      attempt.finish();
    }
  }

  async function analyze() {
    if (!photo || offline || pending.current || rows) return;
    const attempt = start("analyzing");
    try {
      const estimate = await analyzeMealPhoto(
        photo,
        { owner, current: attempt.current },
        attempt.signal,
      );
      if (!attempt.current()) return;
      setRows(
        openPhotoMealReview(estimate).items.map((item, index) => ({
          id: nextId.current++,
          item,
          uncertain: estimate.items[index].confidence === "low",
        })),
      );
    } catch (cause) {
      if (attempt.current())
        setNotice(errors[cause instanceof MealPhotoError ? cause.code : "invalid"]);
    } finally {
      attempt.finish();
    }
  }

  function update(id: number, edit: (row: DraftRow) => DraftRow) {
    setNotice("");
    setRows((list) => list?.map((row) => (row.id === id ? edit(row) : row)) ?? null);
  }

  const result = rows ? photoReview(rows) : null;

  return (
    <section className="meal-photo" aria-labelledby={heading}>
      <header className="meal-photo-heading">
        <h1 id={heading}>Måltidsfoto</h1>
        <input
          ref={fileInput}
          type="file"
          accept={mealPhotoAccept}
          aria-label="Bild på måltiden"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void choose(file);
          }}
        />
        <button type="button" className="k-secondary" onClick={() => fileInput.current?.click()}>
          <ImagePlus size={18} aria-hidden />
          {photo ? "Byt bild" : "Välj bild"}
        </button>
      </header>

      {photo && <img className="meal-photo-preview" src={photo.src} alt="Din valda måltidsbild" />}
      {busy && (
        <p role="status">{busy === "preparing" ? "Öppnar bilden…" : "Analyserar måltiden…"}</p>
      )}
      {notice && (
        <p className="meal-photo-alert" role="alert">
          {notice}
        </p>
      )}
      {photo && !rows && (
        <>
          <p id={disclosure} className="meal-photo-detail">
            Vid analys skickas en nedskalad kopia till OpenAI. WineSnap sparar inte bilden vid
            analys. OpenAI kan behålla uppgifter för missbruksövervakning.{" "}
            <a
              href="https://developers.openai.com/api/docs/guides/your-data"
              target="_blank"
              rel="noreferrer"
            >
              OpenAI:s datahantering
            </a>
          </p>
          {offline && <p role="status">Offline. Bildanalys kräver anslutning.</p>}
        </>
      )}

      {confirmed ? (
        <div className="meal-photo-review">
          <h2>
            <Check size={18} aria-hidden /> Granskat underlag
          </h2>
          <p role="status">Inget har sparats i måltidshistoriken.</p>
          <ul className="meal-photo-summary">
            {confirmed.items.map((item, index) => (
              <li key={rows?.[index].id ?? index}>
                <strong>{item.name}</strong>
                <span>{portionText(item.portion)}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="k-secondary" onClick={() => setConfirmed(null)}>
            Redigera underlaget
          </button>
        </div>
      ) : (
        rows && (
          <div className="meal-photo-review">
            <h2>Granska måltiden</h2>
            <p className="meal-photo-detail">
              Bildens mängder är uppskattningar, inte uppmätta vikter.
            </p>
            {!rows.length && <p role="status">Inga livsmedel kunde föreslås.</p>}
            <ol className="meal-photo-items">
              {rows.map((row, index) => (
                <li className="meal-photo-item" key={row.id}>
                  <label>
                    <span>Livsmedel {index + 1}</span>
                    <input
                      value={row.item.name}
                      maxLength={100}
                      onChange={(event) => {
                        const name = event.target.value;
                        update(row.id, (previous) => ({
                          ...previous,
                          item: renamePhotoMealItem(previous.item, name),
                          uncertain:
                            name.trim() === previous.item.name.trim() && previous.uncertain,
                        }));
                      }}
                    />
                  </label>
                  <label>
                    <span>Egen mängd (g)</span>
                    <input
                      inputMode="numeric"
                      maxLength={5}
                      value={row.enteredGrams ?? ""}
                      onChange={(event) => {
                        const enteredGrams = event.target.value;
                        update(row.id, (previous) => ({ ...previous, enteredGrams }));
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="k-secondary meal-photo-icon"
                    aria-label={`Ta bort livsmedel ${index + 1}`}
                    title="Ta bort livsmedel"
                    onClick={() =>
                      setRows((list) => list?.filter((value) => value.id !== row.id) ?? null)
                    }
                  >
                    <Trash2 size={17} aria-hidden />
                  </button>
                  <div className="meal-photo-portion">
                    <span>
                      {row.enteredGrams === undefined
                        ? portionText(row.item.portion)
                        : row.enteredGrams.trim()
                          ? "Manuellt angiven mängd"
                          : "Okänd mängd"}
                      {row.uncertain ? " · Osäker identifiering" : ""}
                    </span>
                    {row.item.portion && row.enteredGrams === undefined && (
                      <button
                        type="button"
                        className="k-text"
                        onClick={() =>
                          update(row.id, (previous) => ({
                            ...previous,
                            item: { ...previous.item, portion: null },
                          }))
                        }
                      >
                        Markera mängden som okänd
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="k-secondary"
              disabled={rows.length >= 20}
              onClick={() => {
                const id = nextId.current++;
                setRows((list) =>
                  list && list.length < 20
                    ? [...list, { id, item: { name: "", portion: null } }]
                    : list,
                );
              }}
            >
              <Plus size={18} aria-hidden /> Lägg till livsmedel
            </button>
          </div>
        )
      )}

      <div className="meal-photo-actions">
        {photo && !rows && !busy && (
          <button
            type="button"
            className="k-primary"
            aria-describedby={disclosure}
            disabled={offline}
            onClick={() => void analyze()}
          >
            <ScanLine size={18} aria-hidden /> Analysera bild
          </button>
        )}
        {rows && !confirmed && (
          <button
            type="button"
            className="k-primary"
            disabled={!rows.length}
            onClick={() => {
              if (result?.success) {
                setConfirmed(result.data);
                setNotice("");
              } else
                setNotice(
                  "Ange namn på varje livsmedel. En egen mängd ska vara 1–10 000 gram eller lämnas tom.",
                );
            }}
          >
            <Check size={18} aria-hidden /> Bekräfta underlaget
          </button>
        )}
        {busy && (
          <button type="button" className="k-secondary" onClick={stop}>
            <X size={18} aria-hidden /> Avbryt
          </button>
        )}
        {photo && (
          <button type="button" className="k-secondary" onClick={discard}>
            <Trash2 size={18} aria-hidden /> Kasta bilden
          </button>
        )}
      </div>
    </section>
  );
}
