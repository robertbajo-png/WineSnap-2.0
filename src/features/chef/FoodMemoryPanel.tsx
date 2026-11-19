import { useEffect, useRef, useState, type FormEvent } from "react";
import { Brain, Check, Pencil, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { OperationNotice } from "@/components/OperationNotice";
import { useT } from "@/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { askChef, changeFoodMemory } from "./api";
import { useFoodMemoryState } from "./useFoodMemoryState";
import {
  attributes,
  attributeLabels,
  deriveFoodMemory,
  emptyChefContext,
  memoryEntrySchema,
  type FoodSignal,
} from "./domain";
import "./chef.css";

type FoodMemoryProps = {
  owner: string;
  offline: boolean;
  onChanged: () => void;
};
export function FoodMemoryPanel(props: FoodMemoryProps) {
  return <MemoryForOwner key={props.owner} {...props} />;
}
function MemoryForOwner({ owner, offline, onChanged }: FoodMemoryProps) {
  const t = useT();
  const {
    data,
    loadState,
    busy,
    error,
    notice,
    reload,
    run,
    uncertain,
    reviewReady,
    requiresRead,
    finishUncertain,
  } = useFoodMemoryState(owner, offline, onChanged);
  const [validationError, setValidationError] = useState("");
  const locked = busy || uncertain;
  const [attribute, setAttribute] = useState<(typeof attributes)[number]>("ingredient"),
    [value, setValue] = useState(""),
    [direction, setDirection] = useState<1 | -1>(1);
  const [feedbackId, setFeedbackId] = useState("");
  const [editing, setEditing] = useState<FoodSignal | null>(null);
  const preferenceInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) preferenceInput.current?.focus();
  }, [editing]);
  const [confirm, setConfirm] = useState<{
    action: "forget" | "reset";
    signal?: FoodSignal;
  } | null>(null);
  const request = useRef<{ feedback: string; id: string } | null>(null);
  useEffect(() => {
    if (data)
      setFeedbackId((old) =>
        data.feedback.some((f) => f.id === old) ? old : (data.feedback[0]?.id ?? ""),
      );
    if (offline || !data) setConfirm(null);
  }, [data, offline]);
  function submit(event: FormEvent) {
    event.preventDefault();
    const entry = memoryEntrySchema.safeParse({ attribute, value, direction });
    if (!entry.success) {
      setValidationError("Ange en matpreferens, inte allergier eller medicinska uppgifter.");
      return;
    }
    if (draftStale) return;
    setValidationError("");
    void run(
      (scope) =>
        changeFoodMemory(
          owner,
          editing ? "correct" : "add",
          editing?.id ?? crypto.randomUUID(),
          editing?.revision ?? 0,
          entry.data,
          scope,
        ),
      "Matminnet är uppdaterat.",
      () => {
        setValue("");
        setEditing(null);
      },
    );
  }
  const draftStale =
    !!editing &&
    !!data &&
    !data.signals.some(
      (s) =>
        s.id === editing.id &&
        s.revision === editing.revision &&
        ["pending", "confirmed"].includes(s.status),
    );
  const preferences = data ? deriveFoodMemory(data.signals, owner) : [];
  return (
    <section className="chef-panel" aria-labelledby="food-memory-title">
      <div className="k-title-row">
        <div>
          <p className="k-eyebrow">Dina smaker</p>
          <h1 id="food-memory-title">Matminne</h1>
        </div>
        <Brain size={30} />
      </div>
      <div className="k-actions">
        <button
          className="k-secondary"
          disabled={busy || offline || loadState === "loading"}
          onClick={() => void reload()}
        >
          <RefreshCw size={18} />
          Hämta
        </button>
        <button
          className="k-text"
          disabled={locked || offline || !data}
          onClick={() => setConfirm({ action: "reset" })}
        >
          <Trash2 size={18} />
          Nollställ matminne
        </button>
      </div>
      {offline && <OperationNotice kind="offline">{t("state.memoryOffline")}</OperationNotice>}
      {!offline && loadState === "loading" && (
        <OperationNotice kind="loading">{t("state.memoryLoading")}</OperationNotice>
      )}
      {!offline && loadState === "error" && (
        <OperationNotice
          kind="error"
          action={{ label: t("state.retryRead"), disabled: busy, onClick: () => void reload() }}
        >
          {requiresRead
            ? "Ändringen behöver kontrolleras. Hämta aktuella uppgifter."
            : t("state.memoryFailed")}
        </OperationNotice>
      )}
      {busy && loadState !== "loading" && (
        <OperationNotice kind="loading">{t("state.memoryWorking")}</OperationNotice>
      )}
      {loadState !== "ready" && (editing || value) && <p role="status">Ditt utkast finns kvar.</p>}
      {(error || validationError) && (
        <p className="k-error" role="alert">
          {validationError || error}
        </p>
      )}
      {notice && !uncertain && <p role="status">{notice}</p>}
      {uncertain && (
        <OperationNotice
          kind="pending"
          action={{
            label: "Avsluta försöket",
            disabled: !reviewReady || busy,
            onClick: () => {
              if (finishUncertain()) {
                setValue("");
                setEditing(null);
                setConfirm(null);
                setValidationError("");
              }
            },
          }}
        >
          {reviewReady ? notice : "Försöket väntar på en aktuell läsning."}
        </OperationNotice>
      )}
      {!offline && data && loadState === "ready" && (
        <>
          <h2>Bekräftat</h2>
          {!preferences.length ? (
            <p>Inga bekräftade matpreferenser ännu.</p>
          ) : (
            <ul className="food-memory-list">
              {preferences.map((p) => (
                <li key={`${p.attribute}:${p.value}`}>
                  <div className="k-section-title">
                    <h3>
                      {p.direction > 0 ? "Gillar" : "Undviker"} {p.value}
                    </h3>
                    <div className="k-actions">
                      <button
                        className="k-icon"
                        title={`Korrigera ${p.value}`}
                        aria-label={`Korrigera ${p.value}`}
                        disabled={locked}
                        onClick={() => {
                          setEditing(p.sources[0]);
                          setAttribute(p.attribute);
                          setValue(p.value);
                          setDirection(p.direction as 1 | -1);
                        }}
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        className="k-icon"
                        title={`Glöm ${p.value}`}
                        aria-label={`Glöm ${p.value}`}
                        disabled={locked}
                        onClick={() => setConfirm({ action: "forget", signal: p.sources[0] })}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <p className="chef-meta">
                    {attributeLabels[p.attribute]} ·{" "}
                    {p.explicit
                      ? "Angivet av dig"
                      : `${p.evidenceCount} ${p.evidenceCount === 1 ? "källa" : "källor"} · ${p.confidence < 0.35 ? "svagt underlag, används inte av AI" : "försiktig slutsats"}`}
                  </p>
                  <details>
                    <summary>Visa underlag ({p.evidenceCount})</summary>
                    {p.sources.map((s) => (
                      <blockquote key={s.id}>
                        <p>{s.source_excerpt}</p>
                        <cite>
                          {s.source_title} · {new Date(s.created_at).toLocaleDateString("sv-SE")}
                        </cite>
                      </blockquote>
                    ))}
                  </details>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={submit} className="food-memory-form">
            <h2>{editing ? "Korrigera preferens" : "Lägg till preferens"}</h2>
            {editing && (
              <p>
                Rättningen ersätter slutsatsen. Tidigare AI-samtal och förslag rensas så att de inte
                återanvänder den gamla uppgiften.
              </p>
            )}
            {draftStale && (
              <OperationNotice kind="error">
                Preferensen har ändrats. Ditt utkast finns kvar. Avbryt utkastet och öppna den
                aktuella preferensen innan du sparar.
              </OperationNotice>
            )}
            <div className="k-form-row">
              <label>
                Kategori
                <select
                  aria-label="Kategori"
                  value={attribute}
                  disabled={locked}
                  onChange={(e) => setAttribute(e.target.value as typeof attribute)}
                >
                  {attributes.map((a) => (
                    <option key={a} value={a}>
                      {attributeLabels[a]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Inställning
                <select
                  aria-label="Inställning"
                  value={direction}
                  disabled={locked}
                  onChange={(e) => setDirection(Number(e.target.value) as 1 | -1)}
                >
                  <option value={1}>Gillar</option>
                  <option value={-1}>Undviker</option>
                </select>
              </label>
            </div>
            <label>
              Matpreferens
              <input
                ref={preferenceInput}
                value={value}
                maxLength={80}
                required
                disabled={locked}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
            <div className="k-actions">
              <button className="k-primary" disabled={locked || draftStale || !value.trim()}>
                <Plus size={18} />
                {editing ? "Spara rättning" : "Lägg till"}
              </button>
              {editing && (
                <button
                  type="button"
                  className="k-secondary"
                  disabled={busy || uncertain}
                  onClick={() => {
                    setEditing(null);
                    setValue("");
                    setValidationError("");
                  }}
                >
                  Avbryt
                </button>
              )}
            </div>
          </form>
          <section className="food-memory-feedback">
            <h2>Från matlagningen</h2>
            {data?.feedback.length ? (
              <>
                <label>
                  Välj din feedback
                  <select
                    aria-label="Välj din feedback"
                    value={feedbackId}
                    disabled={locked}
                    onChange={(e) => setFeedbackId(e.target.value)}
                  >
                    {data.feedback.map((f) => (
                      <option key={f.id} value={f.id}>
                        {new Date(f.created_at).toLocaleDateString("sv-SE")} · {f.note.slice(0, 65)}
                      </option>
                    ))}
                  </select>
                </label>
                <blockquote>{data.feedback.find((f) => f.id === feedbackId)?.note}</blockquote>
                <button
                  className="k-secondary"
                  disabled={locked || !feedbackId}
                  onClick={() =>
                    void run(
                      async (scope) => {
                        const id =
                          request.current?.feedback === feedbackId
                            ? request.current.id
                            : crypto.randomUUID();
                        request.current = { feedback: feedbackId, id };
                        await askChef(
                          {
                            action: "extract",
                            requestId: id,
                            context: emptyChefContext,
                            feedbackId,
                          },
                          owner,
                          scope.signal,
                        );
                      },
                      "Analysen är klar. Eventuella förslag väntar på ditt godkännande.",
                      () => {
                        request.current = null;
                      },
                      75000,
                    )
                  }
                >
                  <Sparkles size={18} />
                  Analysera vald feedback med AI
                </button>
              </>
            ) : (
              <p>Ingen ny matlagningsfeedback att analysera.</p>
            )}
          </section>
          <section>
            <h2>Förslag att granska</h2>
            {data?.signals.filter((s) => s.status === "pending").length ? (
              <ul className="food-memory-list">
                {data.signals
                  .filter((s) => s.status === "pending")
                  .map((s) => (
                    <li key={s.id}>
                      <h3>
                        {s.direction > 0 ? "Gillar" : "Undviker"} {s.value}
                      </h3>
                      <blockquote>
                        <p>{s.source_excerpt}</p>
                        <cite>
                          {s.source_title} · {new Date(s.created_at).toLocaleDateString("sv-SE")}
                        </cite>
                      </blockquote>
                      <div className="k-actions">
                        <button
                          className="k-secondary"
                          disabled={locked}
                          onClick={() =>
                            void run(
                              (scope) =>
                                changeFoodMemory(
                                  owner,
                                  "confirm",
                                  s.id,
                                  s.revision,
                                  undefined,
                                  scope,
                                ),
                              "Förslaget är bekräftat.",
                            )
                          }
                        >
                          <Check size={18} />
                          Bekräfta
                        </button>
                        <button
                          className="k-text"
                          disabled={locked}
                          onClick={() => {
                            setEditing(s);
                            setAttribute(s.attribute);
                            setValue(s.value);
                            setDirection(s.direction);
                          }}
                        >
                          <Pencil size={18} />
                          Korrigera
                        </button>
                        <button
                          className="k-text"
                          disabled={locked}
                          onClick={() => setConfirm({ action: "forget", signal: s })}
                        >
                          <Trash2 size={18} />
                          Glöm
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            ) : (
              <p>Inga förslag väntar.</p>
            )}
          </section>
        </>
      )}
      <Dialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(null);
        }}
      >
        <DialogContent className="kitchen-dialog">
          <DialogHeader>
            <DialogTitle>
              {confirm?.action === "reset"
                ? "Nollställ matminnet?"
                : `Glöm ${confirm?.signal?.value}?`}
            </DialogTitle>
            <DialogDescription>
              AI-samtal och osparade AI-förslag rensas. Recept och matlagningshistorik behålls.{" "}
              {confirm?.action === "reset"
                ? "Äldre feedback används inte för att återskapa minnet."
                : "Samma preferens kan inte återskapas automatiskt från tidigare feedback."}
            </DialogDescription>
          </DialogHeader>
          <div className="k-actions">
            <button className="k-secondary" disabled={busy} onClick={() => setConfirm(null)}>
              Avbryt
            </button>
            <button
              className="k-primary"
              disabled={locked || offline || loadState !== "ready"}
              onClick={() => {
                const choice = confirm;
                if (choice)
                  void run(
                    async (scope) => {
                      setConfirm(null);
                      await changeFoodMemory(
                        owner,
                        choice.action,
                        choice.signal?.id ?? crypto.randomUUID(),
                        choice.signal?.revision ?? 0,
                        undefined,
                        scope,
                      );
                    },
                    "Matminnet är uppdaterat.",
                    () => {
                      setConfirm(null);
                      setEditing(null);
                      setValue("");
                    },
                  );
              }}
            >
              <Trash2 size={18} />
              {confirm?.action === "reset" ? "Nollställ" : "Glöm"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
