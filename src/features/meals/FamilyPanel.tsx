import { useRef, useState, type FormEvent } from "react";
import { Check, Copy, LogOut, Plus, RefreshCw, Trash2, UserRound, Users, X } from "lucide-react";
import { familyData } from "./api";
import { familyChange, inviteAccept, inviteCreate, inviteRevoke } from "./mutations";
import { dinerDocumentSchema, type Diner, type DinerDocument } from "./domain";
import { useFreshData } from "./useFreshData";
import { useMealMutation } from "./useMealMutation";
import { MealMutationNotice } from "./MealMutationNotice";
import { HouseholdNameForm, type HouseholdNameDraft } from "./HouseholdNameForm";
import "./meals.css";

export function FamilyPanel({ owner }: { owner: string }) {
  return <FamilyForOwner key={owner} owner={owner} />;
}
function FamilyForOwner({ owner }: { owner: string }) {
  const { data, error, refresh } = useFreshData((signal) => familyData(owner, signal));
  const mutation = useMealMutation(owner, refresh);
  const busy = mutation.locked;
  const [notice, setNotice] = useState("");
  const [nameDraft, setNameDraft] = useState<HouseholdNameDraft | null>(null);
  const [group, setGroup] = useState(""),
    [name, setName] = useState(""),
    [display, setDisplay] = useState(""),
    [adult, setAdult] = useState(false),
    [join, setJoin] = useState("");
  const [code, setCode] = useState(""),
    [copied, setCopied] = useState(false),
    [confirm, setConfirm] = useState("");
  const currentCode = useRef(code);
  currentCode.current = code;
  const [editing, setEditing] = useState<{
    id: string;
    revision: number;
    document: DinerDocument;
    householdId: string | null;
    shared: boolean;
  } | null>(null);
  const selected = data?.groups.find((g) => g.id === group) ?? data?.groups[0];
  const mine = selected?.user_id === owner;
  const run = mutation.run;
  const edit = (d?: Diner) =>
    setEditing(
      d
        ? {
            id: d.id,
            revision: d.revision,
            document: structuredClone(d.document),
            householdId: d.household_id,
            shared: d.shared && !!data?.groups.some((g) => g.id === d.household_id),
          }
        : {
            id: crypto.randomUUID(),
            revision: 0,
            document: { name: "", kind: "adult", preferences: [] },
            householdId: null,
            shared: false,
          },
    );
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const document = dinerDocumentSchema.safeParse(editing.document);
    if (!document.success) {
      setNotice(
        "Kontrollera namn och matönskemål. Allergier och medicinska uppgifter hör inte hemma här.",
      );
      return;
    }
    run(
      () =>
        familyChange(owner, "save_diner", editing.id, editing.revision, {
          document: document.data,
          householdId: editing.householdId,
          shared: editing.shared,
        }),
      () => {
        setEditing(null);
        setConfirm("");
        setNotice("");
      },
    );
  }
  return (
    <section className="meal-panel">
      <div className="k-title-row">
        <div>
          <p className="k-eyebrow">Runt bordet</p>
          <h1>Familj & matönskemål</h1>
        </div>
        <button
          className="k-text"
          title="Hämta familjeuppgifter"
          aria-label="Hämta familjeuppgifter"
          onClick={() => void refresh()}
          disabled={busy}
        >
          <RefreshCw size={20} />
        </button>
      </div>
      <p>Endast matpreferenser. Lägg inte in allergier, diagnoser eller andra hälsouppgifter.</p>
      {error && (
        <p role="alert" className="k-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <MealMutationNotice mutation={mutation} />
      {!data && !error && <p aria-busy="true">Hämtar…</p>}
      {data && (
        <>
          <section className="meal-band">
            <div className="k-section-title">
              <h2>Matprofiler</h2>
              <button className="k-secondary" onClick={() => edit()} disabled={busy}>
                <Plus size={18} />
                Ny profil
              </button>
            </div>
            {!data.diners.length && <p>Inga matprofiler ännu.</p>}
            <ul className="meal-people">
              {data.diners.map((d) => (
                <li key={d.id}>
                  <UserRound size={22} />
                  <div>
                    <strong>{d.document.name}</strong>
                    <p>
                      {d.document.kind === "child" ? "Barnprofil" : "Vuxenprofil"} ·{" "}
                      {d.shared && data.groups.some((g) => g.id === d.household_id)
                        ? "Delad med hushållet"
                        : "Privat"}
                      {d.user_id !== owner ? " · Hanteras av annan medlem" : ""}
                    </p>
                    <p>
                      {d.document.preferences
                        .map((p) => `${p.direction < 0 ? "Undviker" : "Gillar"} ${p.value}`)
                        .join(" · ") || "Inga matönskemål"}
                    </p>
                  </div>
                  {d.user_id === owner && (
                    <button
                      className="k-text"
                      onClick={() => edit(d)}
                      disabled={busy}
                      aria-label={`Redigera ${d.document.name}`}
                    >
                      Redigera
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
          {editing && (
            <form className="meal-editor" onSubmit={submit}>
              <fieldset disabled={busy}>
                <legend>{editing.revision ? "Redigera matprofil" : "Ny matprofil"}</legend>
                <label>
                  Namn eller smeknamn
                  <input
                    required
                    maxLength={60}
                    value={editing.document.name}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        document: { ...editing.document, name: e.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  Profiltyp
                  <select
                    value={editing.document.kind}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        document: {
                          ...editing.document,
                          kind: e.target.value as "adult" | "child",
                        },
                      })
                    }
                  >
                    <option value="adult">Vuxen</option>
                    <option value="child">Barn</option>
                  </select>
                </label>
                {editing.document.kind === "child" && (
                  <p>
                    Barnets egna matönskemål. Vuxnas kostval förs inte över hit. Vin visas aldrig
                    som ett förslag till barnprofilen.
                  </p>
                )}
                <h2>Matönskemål</h2>
                {editing.document.preferences.map((p, i) => (
                  <div className="meal-pref" key={i}>
                    <label>
                      <span className="sr-only">Önskemål {i + 1}</span>
                      <select
                        value={p.direction}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            document: {
                              ...editing.document,
                              preferences: editing.document.preferences.map((v, j) =>
                                j === i ? { ...v, direction: Number(e.target.value) as 1 | -1 } : v,
                              ),
                            },
                          })
                        }
                      >
                        <option value={1}>Gillar</option>
                        <option value={-1}>Undviker</option>
                      </select>
                    </label>
                    <label>
                      <span className="sr-only">Typ av önskemål {i + 1}</span>
                      <select
                        value={p.attribute}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            document: {
                              ...editing.document,
                              preferences: editing.document.preferences.map((v, j) =>
                                j === i
                                  ? { ...v, attribute: e.target.value as typeof p.attribute }
                                  : v,
                              ),
                            },
                          })
                        }
                      >
                        {Object.entries({
                          ingredient: "Ingrediens",
                          cuisine: "Kök",
                          method: "Metod",
                          texture: "Konsistens",
                          equipment: "Utrustning",
                        }).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="sr-only">Matönskemål {i + 1}</span>
                      <input
                        required
                        maxLength={80}
                        value={p.value}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            document: {
                              ...editing.document,
                              preferences: editing.document.preferences.map((v, j) =>
                                j === i ? { ...v, value: e.target.value } : v,
                              ),
                            },
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="k-text"
                      aria-label={`Ta bort önskemål ${i + 1}`}
                      onClick={() =>
                        setEditing({
                          ...editing,
                          document: {
                            ...editing.document,
                            preferences: editing.document.preferences.filter((_, j) => j !== i),
                          },
                        })
                      }
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="k-text"
                  disabled={editing.document.preferences.length >= 20}
                  onClick={() =>
                    setEditing({
                      ...editing,
                      document: {
                        ...editing.document,
                        preferences: [
                          ...editing.document.preferences,
                          { attribute: "ingredient", value: "", direction: 1 },
                        ],
                      },
                    })
                  }
                >
                  <Plus size={18} />
                  Lägg till önskemål
                </button>
                <label>
                  Hushåll
                  <select
                    value={editing.householdId ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, householdId: e.target.value || null, shared: false })
                    }
                  >
                    <option value="">Inget hushåll</option>
                    {data.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="meal-check">
                  <input
                    type="checkbox"
                    disabled={!editing.householdId}
                    checked={editing.shared}
                    onChange={(e) => setEditing({ ...editing, shared: e.target.checked })}
                  />
                  Dela denna profil med hushållets medlemmar
                </label>
                {editing.shared && (
                  <p>
                    Profilens namn, typ och matönskemål blir synliga för inbjudna vuxna. Du ska ha
                    rätt att dela uppgifterna, även för en barnprofil. Recept, vinkällare och privat
                    matminne delas inte.
                  </p>
                )}
                <div className="k-actions">
                  <button className="k-primary" type="submit">
                    <Check size={18} />
                    Spara profil
                  </button>
                  <button
                    className="k-secondary"
                    type="button"
                    onClick={() => {
                      setEditing(null);
                      setConfirm("");
                    }}
                  >
                    Avbryt
                  </button>
                  {editing.revision > 0 && (
                    <button className="k-text" type="button" onClick={() => setConfirm(editing.id)}>
                      <Trash2 size={18} />
                      Radera profil
                    </button>
                  )}
                </div>
                {confirm === editing.id && (
                  <div role="group" aria-label="Bekräfta radering">
                    <p>Radera denna matprofil?</p>
                    <button
                      type="button"
                      className="k-secondary"
                      onClick={() =>
                        run(
                          () => familyChange(owner, "delete_diner", editing.id, editing.revision),
                          () => {
                            setEditing(null);
                            setConfirm("");
                          },
                        )
                      }
                    >
                      Ja, radera profilen
                    </button>
                  </div>
                )}
              </fieldset>
            </form>
          )}
          <section className="meal-band">
            <h2>Hushåll</h2>
            {data.groups.length > 0 && (
              <label>
                Välj hushåll
                <select
                  disabled={busy}
                  value={selected?.id ?? ""}
                  onChange={(e) => {
                    setGroup(e.target.value);
                    setNameDraft(null);
                    setCode("");
                    setConfirm("");
                  }}
                >
                  {data.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {selected && (
              <>
                <p>{mine ? "Du äger hushållet." : "Du är inbjuden medlem."}</p>
                {mine && (
                  <HouseholdNameForm
                    key={selected.id}
                    household={selected}
                    busy={busy}
                    draft={nameDraft?.householdId === selected.id ? nameDraft : null}
                    onDraft={setNameDraft}
                    onSave={(draft, saved) =>
                      run(
                        () =>
                          familyChange(owner, "rename_household", selected.id, draft.revision, {
                            name: draft.name,
                          }),
                        saved,
                      )
                    }
                  />
                )}
                {mine && (
                  <ul className="meal-members">
                    {data.members
                      .filter((m) => m.household_id === selected.id)
                      .map((m) => (
                        <li key={m.id}>
                          <span>
                            {m.display_name}
                            {m.user_id === owner ? " (du)" : ""}
                          </span>
                          {m.user_id !== owner && (
                            <button
                              className="k-text"
                              disabled={busy}
                              onClick={() => setConfirm(m.id)}
                            >
                              <X size={18} />
                              <span className="sr-only">Ta bort {m.display_name}</span>
                            </button>
                          )}
                          {confirm === m.id && (
                            <button
                              className="k-secondary"
                              disabled={busy}
                              onClick={() =>
                                void run(() =>
                                  familyChange(
                                    owner,
                                    "remove_member",
                                    selected.id,
                                    selected.revision,
                                    { userId: m.user_id },
                                  ),
                                )
                              }
                            >
                              Bekräfta borttagning
                            </button>
                          )}
                        </li>
                      ))}
                  </ul>
                )}
                {mine && (
                  <>
                    <button
                      className="k-secondary"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => inviteCreate(owner, selected.id, selected.revision),
                          (value) => {
                            setCode(value);
                            setCopied(false);
                          },
                        )
                      }
                    >
                      <Plus size={18} />
                      Skapa inbjudningskod
                    </button>
                    {code && (
                      <div className="meal-code">
                        <p>
                          Engångskod, giltig i 48 timmar. Dela endast med den vuxna du vill bjuda
                          in.
                        </p>
                        <output>{code}</output>
                        <button
                          className="k-secondary"
                          disabled={busy}
                          onClick={() =>
                            void navigator.clipboard
                              .writeText(code)
                              .then(() => {
                                if (mutation.current() && currentCode.current === code)
                                  setCopied(true);
                              })
                              .catch(() => {
                                if (mutation.current() && currentCode.current === code)
                                  setNotice("Kopiera koden manuellt.");
                              })
                          }
                        >
                          <Copy size={18} />
                          {copied ? "Kopierad" : "Kopiera kod"}
                        </button>
                      </div>
                    )}
                    <ul className="meal-members">
                      {data.invites
                        .filter((i) => i.household_id === selected.id)
                        .map((i) => (
                          <li key={i.id}>
                            <span>Väntande · {new Date(i.expires_at).toLocaleString("sv-SE")}</span>
                            <button
                              className="k-text"
                              disabled={busy}
                              onClick={() =>
                                run(
                                  () => inviteRevoke(owner, i.id),
                                  () => {
                                    setCode("");
                                  },
                                )
                              }
                            >
                              Återkalla
                            </button>
                          </li>
                        ))}
                    </ul>
                  </>
                )}
                <button className="k-text" disabled={busy} onClick={() => setConfirm(selected.id)}>
                  {mine ? <Trash2 size={18} /> : <LogOut size={18} />}{" "}
                  {mine ? "Radera hushållet" : "Lämna hushållet"}
                </button>
                {confirm === selected.id && (
                  <div>
                    <p>
                      {mine
                        ? "Hushållet och delningen försvinner. Varje medlem behåller sina egna matprofiler privat."
                        : "Delningen upphör för dig och dina profiler. Privata uppgifter behålls."}
                    </p>
                    <button
                      className="k-secondary"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            familyChange(
                              owner,
                              mine ? "delete_household" : "leave_household",
                              selected.id,
                              selected.revision,
                            ),
                          () => {
                            setCode("");
                            setConfirm("");
                          },
                        )
                      }
                    >
                      Bekräfta
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
          <section className="meal-band">
            <h2>Skapa eller gå med</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const joining = !!join.trim();
                run(
                  () =>
                    joining
                      ? inviteAccept(owner, join, display, adult)
                      : familyChange(owner, "create_household", crypto.randomUUID(), 0, {
                          name,
                          displayName: display,
                          adultConfirmed: adult,
                        }),
                  () => {
                    if (joining) setJoin("");
                    else setName("");
                  },
                );
              }}
            >
              <fieldset disabled={busy}>
                <label>
                  Ditt smeknamn
                  <input
                    required
                    maxLength={60}
                    value={display}
                    onChange={(e) => setDisplay(e.target.value)}
                  />
                </label>
                <label>
                  Hushållets namn
                  <input
                    maxLength={80}
                    required={!join.trim()}
                    disabled={!!join.trim()}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  Eller inbjudningskod
                  <input
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={64}
                    value={join}
                    onChange={(e) => setJoin(e.target.value)}
                  />
                </label>
                <label className="meal-check">
                  <input
                    required
                    type="checkbox"
                    checked={adult}
                    onChange={(e) => setAdult(e.target.checked)}
                  />
                  Jag är vuxen och vill delta i detta hushåll
                </label>
                <button className="k-primary" type="submit">
                  <Users size={18} />
                  {join.trim() ? "Gå med" : "Skapa hushåll"}
                </button>
              </fieldset>
            </form>
          </section>
        </>
      )}
    </section>
  );
}
