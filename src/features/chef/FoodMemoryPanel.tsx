import { useEffect, useRef, useState, type FormEvent } from "react";
import { Brain, Check, Pencil, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { askChef, changeFoodMemory, foodMemory } from "./api";
import {
  attributes,
  attributeLabels,
  deriveFoodMemory,
  emptyChefContext,
  memoryEntrySchema,
  type FoodSignal,
} from "./domain";
import "./chef.css";

export function FoodMemoryPanel({
  owner,
  offline,
  onChanged,
}: {
  owner: string;
  offline: boolean;
  onChanged: () => void;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof foodMemory>> | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
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
  const live = useRef(true),
    request = useRef<{ feedback: string; id: string } | null>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  async function reload() {
    const result = await foodMemory(owner);
    if (live.current) {
      setData(result);
      setFeedbackId((old) =>
        result.feedback.some((f) => f.id === old) ? old : (result.feedback[0]?.id ?? ""),
      );
    }
  }
  useEffect(() => {
    let active = true;
    if (!offline)
      void foodMemory(owner)
        .then((result) => {
          if (active) {
            setData(result);
            setFeedbackId(result.feedback[0]?.id ?? "");
          }
        })
        .catch((cause) => {
          if (active) setError(cause.message);
        });
    return () => {
      active = false;
    };
  }, [owner, offline]);
  async function run(action: () => Promise<void>, message: string) {
    if (busy || offline) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (!live.current) return;
      await reload();
      setNotice(message);
      onChanged();
    } catch (cause) {
      if (live.current)
        setError(cause instanceof Error ? cause.message : "Kunde inte uppdatera matminnet.");
    } finally {
      if (live.current) setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const entry = memoryEntrySchema.safeParse({ attribute, value, direction });
    if (!entry.success) {
      setError("Ange en matpreferens, inte allergier eller medicinska uppgifter.");
      return;
    }
    void run(async () => {
      await changeFoodMemory(
        owner,
        editing ? "correct" : "add",
        editing?.id ?? crypto.randomUUID(),
        editing?.revision ?? 0,
        entry.data,
      );
      if (live.current) {
        setValue("");
        setEditing(null);
      }
    }, "Matminnet är uppdaterat.");
  }
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
          disabled={busy || offline}
          onClick={() => void run(reload, "Uppdaterat.")}
        >
          <RefreshCw size={18} />
          Hämta
        </button>
        <button
          className="k-text"
          disabled={busy || offline || !data}
          onClick={() => setConfirm({ action: "reset" })}
        >
          <Trash2 size={18} />
          Nollställ matminne
        </button>
      </div>
      {offline && <p role="status">Anslut för att läsa eller ändra ditt matminne.</p>}
      {error && (
        <p className="k-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!offline && (
        <>
          <h2>Bekräftat</h2>
          {!data ? (
            <p aria-busy="true">Hämtar matminnet…</p>
          ) : !preferences.length ? (
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
                        disabled={busy}
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
                        disabled={busy}
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
            <div className="k-form-row">
              <label>
                Kategori
                <select
                  aria-label="Kategori"
                  value={attribute}
                  disabled={busy}
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
                  disabled={busy}
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
                disabled={busy}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
            <div className="k-actions">
              <button className="k-primary" disabled={busy || !value.trim()}>
                <Plus size={18} />
                {editing ? "Spara rättning" : "Lägg till"}
              </button>
              {editing && (
                <button
                  type="button"
                  className="k-secondary"
                  onClick={() => {
                    setEditing(null);
                    setValue("");
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
                    disabled={busy}
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
                  disabled={busy || !feedbackId}
                  onClick={() =>
                    void run(async () => {
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
                      );
                      request.current = null;
                    }, "Analysen är klar. Eventuella förslag väntar på ditt godkännande.")
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
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => changeFoodMemory(owner, "confirm", s.id, s.revision),
                              "Förslaget är bekräftat.",
                            )
                          }
                        >
                          <Check size={18} />
                          Bekräfta
                        </button>
                        <button
                          className="k-text"
                          disabled={busy}
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
                          disabled={busy}
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
              disabled={busy}
              onClick={() => {
                const choice = confirm;
                if (choice)
                  void run(async () => {
                    await changeFoodMemory(
                      owner,
                      choice.action,
                      choice.signal?.id ?? crypto.randomUUID(),
                      choice.signal?.revision ?? 0,
                    );
                    if (live.current) {
                      setConfirm(null);
                      setEditing(null);
                      setValue("");
                    }
                  }, "Matminnet är uppdaterat.");
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
