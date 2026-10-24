import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  BookOpen,
  Check,
  CheckCheck,
  ChefHat,
  Clock3,
  CloudOff,
  CookingPot,
  Download,
  History,
  Loader2,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Star,
  Timer,
  Trash2,
  Wine,
  Brain,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { kitchenEnabled } from "./feature";
import { useKitchen } from "./useKitchen";
import { blankRecipe, recipeImages, startingRecipes } from "./catalog";
import { recipeHistory } from "./api";
import {
  changeSessionStatus,
  convertAmount,
  formatTimer,
  newTimer,
  recipeSchema,
  scaledAmount,
  timerRemaining,
  toggleCookingTimer,
  units,
  type CookingFeedback,
  type CookingState,
  type RecipeDocument,
  type RecipeVersion,
  type LocalSession,
} from "./domain";
import "./kitchen.css";
import { chefEnabled } from "../chef/api";
import { ChefPanel, type ChefOpening } from "../chef/ChefPanel";
import { FoodMemoryPanel } from "../chef/FoodMemoryPanel";
import { emptyChefContext } from "../chef/domain";

const unitLabel: Record<(typeof units)[number], string> = {
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
function IconButton({
  label,
  children,
  ...props
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="k-icon" title={label} aria-label={label} {...props}>
      {children}
    </button>
  );
}
function PortionControl({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="k-portions">
      <IconButton
        label="Färre portioner"
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={18} />
      </IconButton>
      <span>
        <strong>{value}</strong> portioner
      </span>
      <IconButton
        label="Fler portioner"
        disabled={disabled || value >= 24}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={18} />
      </IconButton>
    </div>
  );
}
function Ingredients({
  document,
  servings,
  checked = [],
  onCheck,
  disabled,
}: {
  document: RecipeDocument;
  servings: number;
  checked?: string[];
  onCheck?: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <ul className="k-ingredients">
      {document.ingredients.map((ingredient) => (
        <li key={ingredient.id}>
          <label>
            {onCheck && (
              <input
                type="checkbox"
                checked={checked.includes(ingredient.id)}
                disabled={disabled}
                onChange={() => onCheck(ingredient.id)}
              />
            )}
            <span>{ingredient.name}</span>
            <strong>
              {ingredient.amount === 0
                ? "efter smak"
                : `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 3 }).format(scaledAmount(ingredient.amount, document.servings, servings))} ${unitLabel[ingredient.unit]}`}
            </strong>
          </label>
        </li>
      ))}
    </ul>
  );
}
type EditorState = {
  document: RecipeDocument;
  recipeId: string;
  versionId: string;
  revision: number;
};
function RecipeEditor({
  initial,
  busy,
  onSave,
  onClose,
}: {
  initial: EditorState;
  busy: boolean;
  onSave: (editor: EditorState) => Promise<void>;
  onClose: () => void;
}) {
  const [document, setDocument] = useState(initial.document);
  const [error, setError] = useState("");
  const patch = (value: Partial<RecipeDocument>) =>
    setDocument((current) => ({ ...current, ...value }));
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = recipeSchema.safeParse(document);
    if (!parsed.success) {
      setError(
        "Kontrollera namn, mängder och steg. Receptet behöver minst en ingrediens och ett tillagningssteg.",
      );
      return;
    }
    setError("");
    void onSave({ ...initial, document: parsed.data });
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="kitchen-dialog k-editor">
        <DialogHeader>
          <DialogTitle>{initial.revision ? "Din nästa receptversion" : "Nytt recept"}</DialogTitle>
          <DialogDescription>
            {initial.revision
              ? `Version ${initial.revision + 1}. Pågående matlagning behåller sin tidigare version.`
              : "Sparas privat i din kokbok."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <label>
              Receptnamn
              <input
                autoFocus
                value={document.title}
                maxLength={140}
                required
                onChange={(event) => patch({ title: event.target.value })}
              />
            </label>
            <label>
              Beskrivning
              <textarea
                value={document.description}
                maxLength={1200}
                onChange={(event) => patch({ description: event.target.value })}
              />
            </label>
            <div className="k-form-row">
              <label>
                Grundportioner
                <input
                  type="number"
                  min={1}
                  max={24}
                  required
                  value={document.servings}
                  onChange={(event) => patch({ servings: Number(event.target.value) })}
                />
              </label>
              <label>
                Tid, minuter
                <input
                  type="number"
                  min={1}
                  max={1440}
                  required
                  value={document.totalMinutes}
                  onChange={(event) => patch({ totalMinutes: Number(event.target.value) })}
                />
              </label>
            </div>
            <h3>Ingredienser</h3>
            <div className="k-edit-ingredients">
              {document.ingredients.map((ingredient, index) => (
                <div key={ingredient.id}>
                  <label>
                    <span className="sr-only">Ingrediens {index + 1}</span>
                    <input
                      aria-label={`Ingrediens ${index + 1}`}
                      value={ingredient.name}
                      placeholder="Ingrediens"
                      required
                      maxLength={120}
                      onChange={(event) =>
                        patch({
                          ingredients: document.ingredients.map((item) =>
                            item.id === ingredient.id
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span className="sr-only">Mängd {index + 1}</span>
                    <input
                      aria-label={`Mängd ${index + 1}`}
                      type="number"
                      min={0}
                      max={100000}
                      step="any"
                      required
                      value={Number.isNaN(ingredient.amount) ? "" : ingredient.amount}
                      onChange={(event) =>
                        patch({
                          ingredients: document.ingredients.map((item) =>
                            item.id === ingredient.id
                              ? {
                                  ...item,
                                  amount:
                                    event.target.value === "" ? NaN : Number(event.target.value),
                                }
                              : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span className="sr-only">Enhet {index + 1}</span>
                    <select
                      aria-label={`Enhet ${index + 1}`}
                      value={ingredient.unit}
                      onChange={(event) => {
                        const unit = event.target.value as (typeof units)[number];
                        let amount: number;
                        try {
                          amount = convertAmount(ingredient.amount, ingredient.unit, unit);
                        } catch {
                          amount = NaN;
                          setError("Ange en ny mängd när du byter mellan vikt, volym och antal.");
                        }
                        patch({
                          ingredients: document.ingredients.map((item) =>
                            item.id === ingredient.id ? { ...item, unit, amount } : item,
                          ),
                        });
                      }}
                    >
                      {units.map((unit) => (
                        <option key={unit} value={unit}>
                          {unitLabel[unit]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <IconButton
                    label={`Ta bort ingrediens ${index + 1}`}
                    disabled={document.ingredients.length === 1}
                    onClick={() =>
                      patch({
                        ingredients: document.ingredients.filter(
                          (item) => item.id !== ingredient.id,
                        ),
                      })
                    }
                  >
                    <Trash2 size={17} />
                  </IconButton>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="k-text"
              disabled={document.ingredients.length >= 80}
              onClick={() =>
                patch({
                  ingredients: [
                    ...document.ingredients,
                    { id: crypto.randomUUID(), name: "", amount: 1, unit: "pcs" },
                  ],
                })
              }
            >
              <Plus size={18} />
              Ingrediens
            </button>
            <h3>Tillagning</h3>
            {document.steps.map((step, index) => (
              <section className="k-edit-step" key={step.id}>
                <div className="k-section-title">
                  <h4>Steg {index + 1}</h4>
                  <IconButton
                    label={`Ta bort steg ${index + 1}`}
                    disabled={document.steps.length === 1}
                    onClick={() =>
                      patch({ steps: document.steps.filter((item) => item.id !== step.id) })
                    }
                  >
                    <Trash2 size={18} />
                  </IconButton>
                </div>
                <label>
                  Rubrik
                  <input
                    required
                    maxLength={140}
                    value={step.title}
                    onChange={(event) =>
                      patch({
                        steps: document.steps.map((item) =>
                          item.id === step.id ? { ...item, title: event.target.value } : item,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Instruktion
                  <textarea
                    required
                    maxLength={2000}
                    value={step.text}
                    onChange={(event) =>
                      patch({
                        steps: document.steps.map((item) =>
                          item.id === step.id ? { ...item, text: event.target.value } : item,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Timer, minuter (valfritt)
                  <input
                    type="number"
                    min={1}
                    max={360}
                    value={step.timerSeconds === null ? "" : step.timerSeconds / 60}
                    step="any"
                    onChange={(event) =>
                      patch({
                        steps: document.steps.map((item) =>
                          item.id === step.id
                            ? {
                                ...item,
                                timerSeconds:
                                  event.target.value === ""
                                    ? null
                                    : Math.round(Number(event.target.value) * 60),
                              }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
              </section>
            ))}
            <button
              type="button"
              className="k-text"
              disabled={document.steps.length >= 40}
              onClick={() =>
                patch({
                  steps: [
                    ...document.steps,
                    { id: crypto.randomUUID(), title: "", text: "", timerSeconds: null },
                  ],
                })
              }
            >
              <Plus size={18} />
              Tillagningssteg
            </button>
            <label>
              Egna anteckningar
              <textarea
                maxLength={2000}
                value={document.notes}
                onChange={(event) => patch({ notes: event.target.value })}
              />
            </label>
            <label>
              Källa
              <input
                maxLength={400}
                value={document.sourceNote}
                onChange={(event) => patch({ sourceNote: event.target.value })}
              />
            </label>
            {error && (
              <p role="alert" className="k-error">
                {error}
              </p>
            )}
            <div className="k-actions">
              <button type="button" className="k-secondary" onClick={onClose}>
                Avbryt
              </button>
              <button className="k-primary" type="submit">
                {busy ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                {initial.revision ? "Spara ny version" : "Spara recept"}
              </button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function KitchenPage() {
  const { user, loading } = useAuth();
  if (!kitchenEnabled)
    return (
      <div className="kitchen">
        <main className="k-main">
          <h1>Köket är inte aktiverat</h1>
          <Link to="/">Till WineSnap</Link>
        </main>
      </div>
    );
  if (loading)
    return (
      <div className="kitchen">
        <main className="k-main" aria-busy="true">
          <Loader2 className="animate-spin" />
          <p>Öppnar köket…</p>
        </main>
      </div>
    );
  if (!user)
    return (
      <div className="kitchen">
        <main className="k-main">
          <ChefHat size={32} />
          <h1>Ditt kök</h1>
          <Link className="k-primary" to="/login">
            Logga in
          </Link>
        </main>
      </div>
    );
  return <KitchenWorkspace key={user.id} owner={user.id} />;
}
function KitchenWorkspace({ owner }: { owner: string }) {
  const kitchen = useKitchen(owner);
  const { cache, busy, ready, offline, error, conflict } = kitchen;
  const [tab, setTab] = useState("library");
  const [chefOpening, setChefOpening] = useState<ChefOpening>({
    mode: "chat",
    context: emptyChefContext,
    title: "Ditt kök",
  });
  const [chefSource, setChefSource] = useState<RecipeVersion | undefined>();
  const [chefEpoch, setChefEpoch] = useState(0);
  const [selected, setSelected] = useState<RecipeVersion | null>(null);
  const [selectedPast, setSelectedPast] = useState<LocalSession | null>(null);
  const [servings, setServings] = useState(2);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [history, setHistory] = useState<RecipeVersion[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [confirm, setConfirm] = useState<"finish" | "abandon" | "archive" | null>(null);
  const [feedback, setFeedback] = useState<CookingFeedback>({ rating: null, note: "" });
  const [timerName, setTimerName] = useState("");
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [now, setNow] = useState(Date.now());
  const [clockChanged, setClockChanged] = useState(false);
  const local = selectedPast ?? cache?.session;
  const state = local?.state;
  const cooking = state && ["running", "paused"].includes(state.status);
  const document = local?.version.document;
  const step = document && state ? document.steps[state.activeStep] : null;
  const cacheOwner = cache?.owner;
  useEffect(() => {
    if (!ready || !cacheOwner || !navigator.onLine || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.ready
      .then((registration) => {
        registration.active?.postMessage("PREPARE_KITCHEN");
      })
      .catch(() => undefined);
  }, [ready, cacheOwner]);
  useEffect(() => {
    const route = () => {
      const hash = window.location.hash.slice(1);
      setTab(
        hash === "cook" || (chefEnabled && ["chef", "memory"].includes(hash)) ? hash : "library",
      );
    };
    route();
    window.addEventListener("hashchange", route);
    let wall = Date.now(),
      monotonic = performance.now();
    const timer = window.setInterval(() => {
      const next = Date.now(),
        tick = performance.now();
      if (Math.abs(next - wall - (tick - monotonic)) > 5000) setClockChanged(true);
      wall = next;
      monotonic = tick;
      setNow(next);
    }, 500);
    return () => {
      window.removeEventListener("hashchange", route);
      window.clearInterval(timer);
    };
  }, []);
  const navigate = (next: string) => {
    setSelectedPast(null);
    setSelected(null);
    setHistory(null);
    window.location.hash = ["cook", "chef", "memory"].includes(next) ? next : "recipes";
    setTab(next);
  };
  const openRecipe = (version: RecipeVersion) => {
    window.location.hash = "recipes";
    setSelected(version);
    setServings(version.document.servings);
    setHistory(null);
    setTab("library");
  };
  const edit = (document: RecipeDocument, version?: RecipeVersion) =>
    setEditor({
      document: structuredClone(document),
      recipeId: version?.recipe_id ?? crypto.randomUUID(),
      versionId: crypto.randomUUID(),
      revision: version?.revision ?? 0,
    });
  const openChef = (opening: ChefOpening, source?: RecipeVersion) => {
    setChefOpening(opening);
    setChefSource(source);
    setChefEpoch((epoch) => epoch + 1);
    navigate("chef");
  };
  const change = (patch: Partial<CookingState>) => {
    if (state) void kitchen.change({ ...state, ...patch });
  };
  const statusText = !cache
    ? "Inte ansluten"
    : offline
      ? "Offline"
      : local?.dirty
        ? "Väntar på synkning"
        : "Sparat";
  async function showHistory() {
    if (!selected) return;
    setHistoryError("");
    try {
      setHistory(await recipeHistory(owner, selected.recipe_id));
    } catch {
      setHistoryError("Versionshistoriken kunde inte hämtas. Försök igen när du är online.");
    }
  }
  return (
    <div className="kitchen">
      <header className="k-header">
        <a href="/kitchen" className="k-brand">
          <ChefHat size={24} />
          <span>Köket</span>
        </a>
        <Link to="/" className="k-wine">
          <Wine size={18} />
          WineSnap
        </Link>
      </header>
      <main className="k-main" id="kitchen-content">
        <nav className={`k-tabs${chefEnabled ? " has-chef" : ""}`} aria-label="Köket">
          <button
            aria-current={tab === "library" ? "page" : undefined}
            onClick={() => navigate("library")}
          >
            <BookOpen size={18} />
            Recept
          </button>
          <button
            aria-current={tab === "cook" ? "page" : undefined}
            onClick={() => navigate("cook")}
          >
            <CookingPot size={18} />
            Matlagning{cooking && <span className="k-live-dot" aria-label="Pågår" />}
          </button>
          {chefEnabled && (
            <>
              <button
                aria-current={tab === "chef" ? "page" : undefined}
                onClick={() =>
                  openChef({ mode: "chat", context: emptyChefContext, title: "Ditt kök" })
                }
              >
                <ChefHat size={18} />
                AI-kock
              </button>
              <button
                aria-current={tab === "memory" ? "page" : undefined}
                onClick={() => navigate("memory")}
              >
                <Brain size={18} />
                Matminne
              </button>
            </>
          )}
        </nav>
        <div className="k-status" role="status">
          {offline ? (
            <CloudOff size={16} />
          ) : local?.dirty ? (
            <RefreshCw size={16} />
          ) : (
            <CheckCheck size={16} />
          )}
          {busy ? "Sparar…" : statusText}
          <button
            className="k-text"
            disabled={busy || offline}
            onClick={() => {
              void kitchen.sync();
            }}
            title="Synka matlagningen"
          >
            <RefreshCw size={15} />
            <span className="sr-only">Synka matlagningen</span>
          </button>
        </div>
        {error && (
          <div className="k-error" role="alert">
            <p>{error}</p>
            <button className="k-text" disabled={busy} onClick={kitchen.reload}>
              <RefreshCw size={18} />
              Hämta uppdateringen
            </button>
          </div>
        )}
        {conflict && (
          <section className="k-conflict" aria-label="Synkningskonflikt">
            <h2>Välj vilken matlagning du vill behålla</h2>
            <p>
              På enheten: steg {(state?.activeStep ?? 0) + 1}. På servern: steg{" "}
              {conflict.state.activeStep + 1}. Inget skrivs över innan du väljer.
            </p>
            <div className="k-actions">
              <button
                className="k-secondary"
                disabled={busy}
                onClick={() => {
                  void kitchen.acceptRemote();
                }}
              >
                Använd serverns version
              </button>
              <button
                className="k-primary"
                disabled={
                  busy ||
                  conflict.id !== local?.id ||
                  ["completed", "abandoned"].includes(conflict.state.status)
                }
                onClick={() => {
                  void kitchen.keepLocal();
                }}
              >
                Spara mina ändringar
              </button>
            </div>
          </section>
        )}
        {!ready ? (
          <p aria-busy="true">Hämtar din kokbok…</p>
        ) : !cache ? (
          <section className="k-empty">
            <BookOpen size={32} />
            <h1>Kokboken är inte tillgänglig</h1>
            <p>Anslut och logga in för att hämta dina privata recept.</p>
          </section>
        ) : (
          <>
            {chefEnabled && tab === "chef" && (
              <ChefPanel
                key={`${owner}:${chefEpoch}`}
                owner={owner}
                opening={chefOpening}
                offline={offline}
                onReview={(draft) =>
                  edit(
                    draft,
                    chefSource
                      ? (cache.versions.find((v) => v.recipe_id === chefSource.recipe_id) ??
                          chefSource)
                      : undefined,
                  )
                }
              />
            )}
            {chefEnabled && tab === "memory" && (
              <FoodMemoryPanel
                owner={owner}
                offline={offline}
                onChanged={() => setChefEpoch((epoch) => epoch + 1)}
              />
            )}
            {tab === "library" && !selected && (
              <>
                <div className="k-title-row">
                  <div>
                    <p className="k-eyebrow">Din kokbok</p>
                    <h1>Vad lagar vi idag?</h1>
                  </div>
                  <button
                    className="k-primary"
                    disabled={busy || offline}
                    onClick={() => edit(blankRecipe())}
                  >
                    <Plus size={18} />
                    <span>Nytt recept</span>
                  </button>
                </div>
                {chefEnabled && (
                  <button
                    className="k-text"
                    disabled={offline || busy}
                    onClick={() =>
                      openChef({
                        mode: "generate",
                        context: emptyChefContext,
                        title: "Nytt recept",
                      })
                    }
                  >
                    <Sparkles size={18} />
                    Skapa med AI
                  </button>
                )}
                {cooking && (
                  <button className="k-resume" onClick={() => navigate("cook")}>
                    <CookingPot size={22} />
                    <span>
                      <strong>{document?.title}</strong>
                      <small>
                        Steg {(state?.activeStep ?? 0) + 1} ·{" "}
                        {state?.status === "paused" ? "Pausad" : "Pågår"}
                      </small>
                    </span>
                    <ArrowRight size={21} />
                  </button>
                )}
                <label className="k-search">
                  <Search size={20} />
                  <span className="sr-only">Sök recept</span>
                  <input
                    type="search"
                    placeholder="Sök recept eller ingrediens"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                {cache.versions.length ? (
                  <div className="k-recipe-grid">
                    {cache.versions
                      .filter((version) =>
                        `${version.document.title} ${version.document.ingredients.map((item) => item.name).join(" ")}`
                          .toLocaleLowerCase("sv-SE")
                          .includes(search.toLocaleLowerCase("sv-SE")),
                      )
                      .map((version) => (
                        <button
                          className="k-recipe"
                          key={version.id}
                          onClick={() => openRecipe(version)}
                        >
                          {recipeImages[version.document.image] ? (
                            <img
                              src={recipeImages[version.document.image]}
                              alt={version.document.title}
                            />
                          ) : (
                            <div className="k-recipe-placeholder">
                              <CookingPot size={44} />
                            </div>
                          )}
                          <div>
                            <h2>{version.document.title}</h2>
                            <p>
                              <Clock3 size={15} />
                              {version.document.totalMinutes} min{" "}
                              <span>· {version.document.servings} portioner</span>
                            </p>
                          </div>
                        </button>
                      ))}
                  </div>
                ) : (
                  <section className="k-empty">
                    <BookOpen size={28} />
                    <h2>Din första sida i kokboken</h2>
                    <p>Spara ett eget recept eller börja med något av recepten nedan.</p>
                  </section>
                )}
                {cache.versions.length > 0 &&
                  search &&
                  !cache.versions.some((version) =>
                    `${version.document.title} ${version.document.ingredients.map((item) => item.name).join(" ")}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  ) && <p>Inga recept matchar sökningen.</p>}
                {!!cache.history.length && (
                  <section className="k-starting">
                    <h2>Senast lagat</h2>
                    <div className="k-history">
                      {cache.history.map((session) => (
                        <button
                          key={session.id}
                          onClick={() => {
                            setSelectedPast(session);
                            setSelected(null);
                            setTab("cook");
                            window.location.hash = "cook";
                          }}
                        >
                          <span>{session.version.document.title}</span>
                          <span>
                            {session.state.status === "abandoned"
                              ? "Avbruten"
                              : session.feedback?.rating
                                ? `${session.feedback.rating}/5`
                                : "Avslutad"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                <section className="k-starting">
                  <h2>Att börja med</h2>
                  <div className="k-starting-list">
                    {startingRecipes.map((recipe) => (
                      <button
                        key={recipe.title}
                        disabled={offline || busy}
                        onClick={() => edit(recipe)}
                      >
                        <img src={recipeImages[recipe.image]} alt="" />
                        <span>
                          <strong>{recipe.title}</strong>
                          <small>
                            {recipe.totalMinutes} min · {recipe.servings} portioner
                          </small>
                        </span>
                        <Plus size={20} />
                      </button>
                    ))}
                  </div>
                </section>
              </>
            )}
            {tab === "library" && selected && (
              <article className="k-detail">
                <button className="k-text" onClick={() => setSelected(null)}>
                  <ArrowLeft size={18} />
                  Kokboken
                </button>
                {recipeImages[selected.document.image] && (
                  <img
                    className="k-detail-image"
                    src={recipeImages[selected.document.image]}
                    alt={selected.document.title}
                  />
                )}
                <p className="k-eyebrow">
                  Version {selected.revision} · {selected.document.totalMinutes} min
                </p>
                <h1>{selected.document.title}</h1>
                <p className="k-description">{selected.document.description}</p>
                {chefEnabled && (
                  <button
                    className="k-text"
                    disabled={offline || busy}
                    onClick={() =>
                      openChef(
                        {
                          mode: "adapt",
                          context: { ...emptyChefContext, recipeVersionId: selected.id },
                          title: selected.document.title,
                        },
                        selected,
                      )
                    }
                  >
                    <Sparkles size={18} />
                    Föreslå receptändring
                  </button>
                )}
                <div className="k-actions">
                  <button
                    className="k-primary"
                    disabled={busy || !!cooking || !!conflict}
                    onClick={async () => {
                      if (await kitchen.begin(selected, servings)) navigate("cook");
                    }}
                  >
                    <Play size={18} />
                    Börja laga
                  </button>
                  <IconButton
                    label="Redigera recept"
                    disabled={busy || offline}
                    onClick={() =>
                      edit(
                        selected.document,
                        cache.versions.find(
                          (version) => version.recipe_id === selected.recipe_id,
                        ) ?? selected,
                      )
                    }
                  >
                    <Pencil size={20} />
                  </IconButton>
                  <IconButton
                    label="Receptets versioner"
                    disabled={offline}
                    onClick={() => {
                      void showHistory();
                    }}
                  >
                    <History size={20} />
                  </IconButton>
                  <IconButton
                    label="Arkivera recept"
                    disabled={busy || offline}
                    onClick={() => setConfirm("archive")}
                  >
                    <Archive size={20} />
                  </IconButton>
                </div>
                {cooking && (
                  <button className="k-text" onClick={() => navigate("cook")}>
                    <CookingPot size={18} />
                    Fortsätt pågående matlagning först
                  </button>
                )}
                {historyError && <p role="alert">{historyError}</p>}
                {history && (
                  <section className="k-history">
                    <h2>Receptversioner</h2>
                    {history.map((version) => (
                      <button
                        key={version.id}
                        aria-current={version.id === selected.id ? "true" : undefined}
                        onClick={() => {
                          setSelected(version);
                          setServings(version.document.servings);
                        }}
                      >
                        Version {version.revision}
                        <span>{new Date(version.created_at).toLocaleDateString("sv-SE")}</span>
                      </button>
                    ))}
                  </section>
                )}
                <section>
                  <div className="k-section-title">
                    <h2>Ingredienser</h2>
                    <PortionControl value={servings} onChange={setServings} />
                  </div>
                  <Ingredients document={selected.document} servings={servings} />
                </section>
                <section>
                  <h2>Tillagning</h2>
                  <ol className="k-method">
                    {selected.document.steps.map((item, index) => (
                      <li key={item.id}>
                        <span>{index + 1}</span>
                        <div>
                          <h3>{item.title}</h3>
                          <p>{item.text}</p>
                          {item.timerSeconds && (
                            <small>
                              <Timer size={15} />
                              {formatTimer(item.timerSeconds * 1000)}
                            </small>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
                {selected.document.notes && (
                  <section>
                    <h2>Dina anteckningar</h2>
                    <p className="k-note">{selected.document.notes}</p>
                  </section>
                )}
                <p className="k-source">{selected.document.sourceNote}</p>
              </article>
            )}
            {tab === "cook" && (!local || !state || !document || !step) && (
              <section className="k-empty">
                <CookingPot size={36} />
                <h1>En sak i taget</h1>
                <p>Välj ett recept när det är dags att laga mat.</p>
                <button className="k-primary" onClick={() => navigate("library")}>
                  <BookOpen size={18} />
                  Till kokboken
                </button>
              </section>
            )}
            {tab === "cook" && local && state && document && step && (
              <div className="k-cook">
                {chefEnabled && cooking && (
                  <button
                    className="k-text"
                    disabled={offline || busy || local.dirty || !!conflict}
                    onClick={() =>
                      openChef(
                        {
                          mode: "chat",
                          context: {
                            recipeVersionId: local.version.id,
                            sessionId: local.id,
                            sessionRevision: local.baseRevision,
                          },
                          title: `${document.title} · steg ${state.activeStep + 1}`,
                        },
                        local.version,
                      )
                    }
                  >
                    <ChefHat size={18} />
                    Fråga AI-kocken
                  </button>
                )}
                <div className="k-cook-heading">
                  <div>
                    <p className="k-eyebrow">
                      {state.status === "completed"
                        ? "Avslutad"
                        : state.status === "abandoned"
                          ? "Avbruten"
                          : `Steg ${state.activeStep + 1} av ${document.steps.length}`}
                    </p>
                    <h1>{document.title}</h1>
                    <small>Receptversion {local.version.revision}</small>
                  </div>
                  {cooking && (
                    <IconButton
                      label={
                        state.status === "paused" ? "Återuppta matlagningen" : "Pausa matlagningen"
                      }
                      disabled={busy || !!conflict}
                      onClick={() => {
                        void kitchen.change(
                          changeSessionStatus(
                            state,
                            state.status === "paused" ? "running" : "paused",
                          ),
                        );
                      }}
                    >
                      {state.status === "paused" ? <Play /> : <Pause />}
                    </IconButton>
                  )}
                </div>
                {clockChanged && (
                  <p className="k-error" role="alert">
                    Enhetens klocka har ändrats. Kontrollera timerinställningarna.
                  </p>
                )}
                {state.status === "paused" && (
                  <p className="k-paused" role="status">
                    <Pause size={18} />
                    Matlagningen och aktiva timers är pausade.
                  </p>
                )}
                {!cooking ? (
                  <section className="k-finished">
                    <CheckCheck size={32} />
                    <h2>
                      {state.status === "completed"
                        ? "Matlagningen är avslutad"
                        : "Matlagningen är avbruten"}
                    </h2>
                    {local.feedback?.rating && <p>Betyg: {local.feedback.rating} av 5</p>}
                    {local.feedback?.note && <p>{local.feedback.note}</p>}
                    <button className="k-primary" onClick={() => navigate("library")}>
                      <BookOpen size={18} />
                      Till kokboken
                    </button>
                  </section>
                ) : (
                  <div className="k-cook-layout">
                    <section className="k-current-step">
                      <progress
                        aria-label="Receptets steg"
                        max={document.steps.length}
                        value={state.activeStep + 1}
                      />
                      <h2>{step.title}</h2>
                      <p>{step.text}</p>
                      {step.timerSeconds && (
                        <button
                          className="k-secondary"
                          disabled={
                            busy ||
                            state.status !== "running" ||
                            state.timers.length >= 8 ||
                            !!conflict
                          }
                          onClick={() =>
                            change({
                              timers: [...state.timers, newTimer(step.title, step.timerSeconds!)],
                            })
                          }
                        >
                          <Timer size={19} />
                          Starta {formatTimer(step.timerSeconds * 1000)}
                        </button>
                      )}
                      <div className="k-step-nav">
                        <button
                          className="k-secondary"
                          disabled={
                            busy ||
                            state.status !== "running" ||
                            state.activeStep === 0 ||
                            !!conflict
                          }
                          onClick={() => change({ activeStep: state.activeStep - 1 })}
                        >
                          <ArrowLeft size={18} />
                          Föregående
                        </button>
                        <button
                          className="k-primary"
                          disabled={busy || state.status !== "running" || !!conflict}
                          onClick={() =>
                            state.activeStep + 1 < document.steps.length
                              ? change({ activeStep: state.activeStep + 1 })
                              : setConfirm("finish")
                          }
                        >
                          {state.activeStep + 1 === document.steps.length ? (
                            <Check size={18} />
                          ) : (
                            <ArrowRight size={18} />
                          )}
                          {state.activeStep + 1 === document.steps.length
                            ? "Avsluta"
                            : "Nästa steg"}
                        </button>
                      </div>
                    </section>
                    <aside>
                      <section>
                        <div className="k-section-title">
                          <h2>Ingredienser</h2>
                          <PortionControl
                            value={state.servings}
                            disabled={busy || !!conflict}
                            onChange={(value) => change({ servings: value })}
                          />
                        </div>
                        <Ingredients
                          document={document}
                          servings={state.servings}
                          checked={state.checkedIngredientIds}
                          disabled={busy || !!conflict}
                          onCheck={(id) =>
                            change({
                              checkedIngredientIds: state.checkedIngredientIds.includes(id)
                                ? state.checkedIngredientIds.filter((item) => item !== id)
                                : [...state.checkedIngredientIds, id],
                            })
                          }
                        />
                      </section>
                      <section className="k-timers">
                        <div className="k-section-title">
                          <h2>Timers</h2>
                          <span>{state.timers.length}/8</span>
                        </div>
                        {state.timers.map((timer) => (
                          <div className="k-timer" key={timer.id}>
                            <div>
                              <strong>{timer.name}</strong>
                              <output role="timer" aria-label={timer.name} aria-live="off">
                                {formatTimer(timerRemaining(timer, now))}
                              </output>
                              {timerRemaining(timer, now) === 0 && (
                                <small role="status">Tiden är ute</small>
                              )}
                            </div>
                            <div className="k-timer-actions">
                              <IconButton
                                label={
                                  timer.deadlineMs === null
                                    ? `Starta ${timer.name}`
                                    : `Pausa ${timer.name}`
                                }
                                disabled={busy || state.status !== "running" || !!conflict}
                                onClick={() =>
                                  change({
                                    timers: state.timers.map((item) =>
                                      item.id === timer.id ? toggleCookingTimer(item) : item,
                                    ),
                                  })
                                }
                              >
                                {timer.deadlineMs === null ? (
                                  <Play size={18} />
                                ) : (
                                  <Pause size={18} />
                                )}
                              </IconButton>
                              <IconButton
                                label={`Starta om ${timer.name}`}
                                disabled={busy || !!conflict}
                                onClick={() =>
                                  change({
                                    timers: state.timers.map((item) =>
                                      item.id === timer.id
                                        ? {
                                            ...item,
                                            deadlineMs:
                                              state.status === "running"
                                                ? Date.now() + item.durationMs
                                                : null,
                                            pausedMs: item.durationMs,
                                          }
                                        : item,
                                    ),
                                  })
                                }
                              >
                                <RotateCcw size={18} />
                              </IconButton>
                              <IconButton
                                label={`Ta bort ${timer.name}`}
                                disabled={busy || !!conflict}
                                onClick={() =>
                                  change({
                                    timers: state.timers.filter((item) => item.id !== timer.id),
                                  })
                                }
                              >
                                <Trash2 size={18} />
                              </IconButton>
                            </div>
                          </div>
                        ))}
                        <form
                          className="k-new-timer"
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (
                              !timerName.trim() ||
                              !Number.isInteger(timerMinutes) ||
                              timerMinutes < 1 ||
                              timerMinutes > 360
                            )
                              return;
                            change({
                              timers: [...state.timers, newTimer(timerName, timerMinutes * 60)],
                            });
                            setTimerName("");
                          }}
                        >
                          <label>
                            Namn
                            <input
                              value={timerName}
                              maxLength={60}
                              required
                              placeholder="Till exempel pasta"
                              onChange={(event) => setTimerName(event.target.value)}
                            />
                          </label>
                          <label>
                            Minuter
                            <input
                              type="number"
                              min={1}
                              max={360}
                              value={timerMinutes}
                              required
                              onChange={(event) => setTimerMinutes(Number(event.target.value))}
                            />
                          </label>
                          <button
                            className="k-icon"
                            title="Lägg till timer"
                            aria-label="Lägg till timer"
                            disabled={
                              busy ||
                              state.status !== "running" ||
                              state.timers.length >= 8 ||
                              !!conflict
                            }
                          >
                            <Plus size={21} />
                          </button>
                        </form>
                        <p className="k-source">
                          Kontrollera maten även när timern går ut. Larm när appen är i bakgrunden
                          kan inte garanteras.
                        </p>
                      </section>
                    </aside>
                  </div>
                )}
                {cooking && (
                  <button
                    className="k-text k-abandon"
                    disabled={busy || !!conflict}
                    onClick={() => setConfirm("abandon")}
                  >
                    <Archive size={18} />
                    Avbryt matlagningen
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </main>
      {editor && (
        <RecipeEditor
          initial={editor}
          busy={busy}
          onClose={() => setEditor(null)}
          onSave={async (value) => {
            const saved = await kitchen.save(
              value.document,
              value.recipeId,
              value.versionId,
              value.revision,
            );
            if (saved) {
              setEditor(null);
              openRecipe(saved);
            }
          }}
        />
      )}
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(null);
        }}
      >
        <DialogContent className="kitchen-dialog">
          <DialogHeader>
            <DialogTitle>
              {confirm === "finish"
                ? "Hur blev maten?"
                : confirm === "archive"
                  ? "Arkivera receptet?"
                  : "Avbryta matlagningen?"}
            </DialogTitle>
            <DialogDescription>
              {confirm === "finish"
                ? "Valfri återkoppling sparas med den här matlagningen."
                : confirm === "archive"
                  ? "Receptet döljs i kokboken. Tidigare versioner och matlagningar behålls."
                  : "Sessionen avslutas och timers stoppas."}
            </DialogDescription>
          </DialogHeader>
          {confirm === "finish" && (
            <div className="k-feedback">
              <div className="k-stars" role="group" aria-label="Betyg">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    type="button"
                    aria-label={`${rating} av 5`}
                    aria-pressed={feedback.rating === rating}
                    key={rating}
                    onClick={() =>
                      setFeedback({
                        ...feedback,
                        rating: feedback.rating === rating ? null : rating,
                      })
                    }
                  >
                    <Star fill={rating <= (feedback.rating ?? 0) ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
              <label>
                Vad vill du minnas?
                <textarea
                  maxLength={1000}
                  value={feedback.note}
                  onChange={(event) => setFeedback({ ...feedback, note: event.target.value })}
                />
              </label>
            </div>
          )}
          <div className="k-actions">
            <button className="k-secondary" disabled={busy} onClick={() => setConfirm(null)}>
              Tillbaka
            </button>
            <button
              className="k-primary"
              disabled={busy}
              onClick={async () => {
                const success =
                  confirm === "archive" && selected
                    ? await kitchen.archive(
                        cache?.versions.find(
                          (version) => version.recipe_id === selected.recipe_id,
                        ) ?? selected,
                      )
                    : state
                      ? await kitchen.change(
                          changeSessionStatus(
                            state,
                            confirm === "finish" ? "completed" : "abandoned",
                          ),
                          confirm === "finish" ? feedback : null,
                        )
                      : false;
                if (success) {
                  if (confirm === "archive") setSelected(null);
                  setConfirm(null);
                }
              }}
            >
              <Check size={18} />
              {confirm === "finish"
                ? "Avsluta matlagningen"
                : confirm === "archive"
                  ? "Arkivera"
                  : "Avbryt matlagningen"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
