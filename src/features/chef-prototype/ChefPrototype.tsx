import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Camera,
  Check,
  ChefHat,
  ChevronRight,
  CircleHelp,
  Clock3,
  CookingPot,
  Heart,
  House,
  Leaf,
  Lightbulb,
  MessageCircle,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Sprout,
  Star,
  Timer,
  Trash2,
  UserRound,
  UsersRound,
  Utensils,
  Wine,
  X,
} from "lucide-react";
import wineImage from "../../assets/hero-bottle.jpg";
import {
  ingredientSuggestions,
  initialMemories,
  recipes,
  type Recipe,
  type RecipeId,
} from "./data";
import {
  createTimer,
  remainingMs,
  sampleAnswer,
  scaleAmount,
  timerText,
  toggleTimer,
  type LocalTimer,
} from "./domain";

type Session = { recipeId: RecipeId; step: number; servings: number; complete: boolean };
type Message = { role: "user" | "assistant"; text: string };
type Modal = "info" | "timer" | "feedback" | "wine" | "replace-session" | null;
const navigation = [
  { id: "home", text: "Hem", icon: House },
  { id: "kitchen", text: "Köket", icon: BookOpen },
  { id: "cook", text: "Laga", icon: CookingPot },
  { id: "wine", text: "Vin", icon: Wine },
  { id: "you", text: "Du", icon: UserRound },
] as const;

function validRoute() {
  const route = window.location.hash.slice(1);
  return /^(home|kitchen|cook|wine|you|chat|recipe\/(cauliflower|pasta|salad))$/.test(route)
    ? route
    : "home";
}

function IconButton({
  label,
  children,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`cp-icon-button ${active ? "is-active" : ""}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function SectionHeading({
  eyebrow,
  title,
  action,
  onAction,
}: {
  eyebrow?: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="cp-section-heading">
      <div>
        {eyebrow && <p className="cp-eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {action && (
        <button className="cp-text-button" onClick={onAction}>
          {action}
          <ArrowUpRight size={18} />
        </button>
      )}
    </div>
  );
}

function Servings({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="cp-servings" aria-label="Antal portioner">
      <UsersRound size={18} />
      <span>
        <strong data-testid="serving-count">{value}</strong> portioner
      </span>
      <IconButton label="Färre portioner" disabled={value <= 1} onClick={() => onChange(value - 1)}>
        <Minus size={17} />
      </IconButton>
      <IconButton label="Fler portioner" disabled={value >= 8} onClick={() => onChange(value + 1)}>
        <Plus size={17} />
      </IconButton>
    </div>
  );
}

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      className="cp-dialog"
      ref={ref}
      aria-labelledby="cp-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            onClose();
        }
      }}
    >
      <header>
        <h2 id="cp-dialog-title">{title}</h2>
        <IconButton label="Stäng" onClick={onClose}>
          <X size={21} />
        </IconButton>
      </header>
      {children}
    </dialog>
  );
}

function IngredientList({
  recipe,
  servings,
  interactive = true,
}: {
  recipe: Recipe;
  servings: number;
  interactive?: boolean;
}) {
  const [checked, setChecked] = useState<string[]>([]);
  return (
    <ul className="cp-ingredient-list">
      {recipe.ingredients.map((ingredient) => (
        <li key={ingredient.name}>
          {interactive ? (
            <label>
              <input
                type="checkbox"
                checked={checked.includes(ingredient.name)}
                onChange={() =>
                  setChecked((current) =>
                    current.includes(ingredient.name)
                      ? current.filter((name) => name !== ingredient.name)
                      : [...current, ingredient.name],
                  )
                }
              />
              <span>{ingredient.name}</span>
              <strong>
                {scaleAmount(ingredient.amount, servings)} {ingredient.unit}
              </strong>
            </label>
          ) : (
            <>
              <span>{ingredient.name}</span>
              <strong>
                {scaleAmount(ingredient.amount, servings)} {ingredient.unit}
              </strong>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function RecipeCard({
  recipe,
  saved,
  onOpen,
  onFavorite,
}: {
  recipe: Recipe;
  saved: boolean;
  onOpen: () => void;
  onFavorite: () => void;
}) {
  return (
    <article className="cp-recipe-card">
      <div className="cp-recipe-photo">
        <button
          className="cp-image-link"
          onClick={onOpen}
          aria-label={`Öppna ${recipe.shortTitle}`}
        >
          <img src={recipe.image} alt={recipe.shortTitle} loading="lazy" />
        </button>
        <button
          className={`cp-save ${saved ? "saved" : ""}`}
          aria-label={`${saved ? "Ta bort sparat recept" : "Spara recept"}: ${recipe.shortTitle}`}
          aria-pressed={saved}
          title="Spara recept"
          onClick={onFavorite}
        >
          <Bookmark size={19} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <p className="cp-eyebrow">{recipe.category}</p>
      <h3>
        <button onClick={onOpen}>{recipe.shortTitle}</button>
      </h3>
      <p className="cp-recipe-meta">
        <Clock3 size={15} />
        {recipe.minutes} min<span>·</span>
        <Leaf size={15} />
        Vegetariskt
      </p>
    </article>
  );
}

export function ChefPrototype() {
  const [route, setRoute] = useState(validRoute);
  const [favorites, setFavorites] = useState<RecipeId[]>(["cauliflower"]);
  const [servings, setServings] = useState(2);
  const [session, setSession] = useState<Session | null>(null);
  const [timers, setTimers] = useState<LocalTimer[]>([]);
  const [now, setNow] = useState(Date.now());
  const [modal, setModal] = useState<Modal>(null);
  const [pendingRecipe, setPendingRecipe] = useState<RecipeId | null>(null);
  const [notice, setNotice] = useState("");
  const [kitchenTab, setKitchenTab] = useState<"cookbook" | "ingredients">("cookbook");
  const [filter, setFilter] = useState("Alla");
  const [search, setSearch] = useState("");
  const [pantry, setPantry] = useState(["Blomkål", "Vita bönor", "Citron"]);
  const [ingredient, setIngredient] = useState("");
  const [maxTime, setMaxTime] = useState(30);
  const [useOven, setUseOven] = useState(true);
  const [workbenchResults, setWorkbenchResults] = useState(false);
  const [keto, setKeto] = useState(false);
  const [memories, setMemories] = useState(initialMemories);
  const [editingMemory, setEditingMemory] = useState<number | null>(null);
  const [memoryText, setMemoryText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [chatContext, setChatContext] = useState<{ recipeId?: RecipeId; cooking: boolean }>({
    cooking: false,
  });
  const [timerName, setTimerName] = useState("Blomkål i ugnen");
  const [timerMinutes, setTimerMinutes] = useState(10);
  const [formError, setFormError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [lastCooking, setLastCooking] = useState<string | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const change = () => setRoute(validRoute());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (!timers.length) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [timers.length]);
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    if (route === "chat") chatEnd.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length, route]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotice("");
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);

  const currentRecipe = recipes.find((recipe) => route === `recipe/${recipe.id}`) ?? recipes[0];
  const cookingRecipe = recipes.find((recipe) => recipe.id === session?.recipeId) ?? recipes[0];
  const activeStep = cookingRecipe.steps[session?.step ?? 0];
  const activeNav = route.startsWith("recipe/") ? "kitchen" : route;
  const contextualRecipe = recipes.find((recipe) => recipe.id === chatContext.recipeId);
  const filteredRecipes = recipes.filter(
    (recipe) =>
      (!search ||
        `${recipe.title} ${recipe.tags.join(" ")}`
          .toLocaleLowerCase("sv-SE")
          .includes(search.toLocaleLowerCase("sv-SE"))) &&
      (filter !== "Sparade" || favorites.includes(recipe.id)) &&
      (filter !== "Snabbt" || recipe.minutes <= 20),
  );
  const workbenchRecipes = recipes.filter(
    (recipe) =>
      recipe.minutes <= maxTime &&
      (useOven || recipe.id !== "cauliflower") &&
      recipe.ingredients.some((item) =>
        pantry.some((chosen) =>
          item.name.toLocaleLowerCase("sv-SE").includes(chosen.toLocaleLowerCase("sv-SE")),
        ),
      ),
  );

  function go(next: string) {
    setRoute(next);
    window.location.hash = next;
    window.scrollTo({ top: 0 });
  }
  function favorite(id: RecipeId) {
    setFavorites((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }
  function openChat(recipe?: Recipe, cooking = false, prompt?: string) {
    setChatContext({ recipeId: recipe?.id, cooking });
    const text = prompt?.trim().slice(0, 1000);
    setMessages(
      text
        ? [
            { role: "user", text },
            {
              role: "assistant",
              text: sampleAnswer(text, recipe?.shortTitle ?? "rostad blomkål", cooking),
            },
          ]
        : [],
    );
    setQuestion("");
    go("chat");
  }
  function startCooking(recipe: Recipe, replace = false) {
    if (session && !session.complete && !replace) {
      if (session.recipeId === recipe.id) {
        go("cook");
        return;
      }
      setPendingRecipe(recipe.id);
      setModal("replace-session");
      return;
    }
    setSession({ recipeId: recipe.id, step: 0, servings, complete: false });
    setTimers([]);
    go("cook");
  }
  function ask(event?: FormEvent, value = question) {
    event?.preventDefault();
    const text = value.trim();
    if (!text) return;
    setMessages((current) => [
      ...current,
      { role: "user", text: text.slice(0, 1000) },
      {
        role: "assistant",
        text: sampleAnswer(
          text,
          contextualRecipe?.shortTitle ?? "rostad blomkål",
          chatContext.cooking,
        ),
      },
    ]);
    setQuestion("");
  }
  function addTimer(event: FormEvent) {
    event.preventDefault();
    try {
      if (timers.length >= 4) {
        setFormError("Du kan ha högst fyra timers.");
        return;
      }
      const time = Date.now();
      const timer = createTimer(crypto.randomUUID(), timerName, timerMinutes, time);
      setNow(time);
      setTimers((current) => [...current, timer]);
      setModal(null);
      setFormError("");
    } catch {
      setFormError("Välj mellan 1 och 180 minuter.");
    }
  }
  function openTimer() {
    setFormError("");
    setTimerName(activeStep.title);
    setTimerMinutes(activeStep.minutes ?? 5);
    setModal("timer");
  }
  function submitFeedback(event: FormEvent) {
    event.preventDefault();
    if (rating === null) return;
    setSession((current) => (current ? { ...current, complete: true } : null));
    setLastCooking(cookingRecipe.shortTitle);
    setTimers([]);
    setModal(null);
    setNotice("Provlagningen är avslutad. Din riktiga historik är oförändrad.");
    go("home");
  }

  function recipeCards(items: Recipe[]) {
    return items.map((recipe) => (
      <RecipeCard
        key={recipe.id}
        recipe={recipe}
        saved={favorites.includes(recipe.id)}
        onOpen={() => go(`recipe/${recipe.id}`)}
        onFavorite={() => favorite(recipe.id)}
      />
    ));
  }

  return (
    <div
      className={`chef-app ${route === "cook" && session && !session.complete ? "cp-cooking" : ""}`}
    >
      <a
        className="cp-skip"
        href="#chef-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("chef-content")?.focus();
          document.getElementById("chef-content")?.scrollIntoView({ block: "start" });
        }}
      >
        Till innehållet
      </a>
      <aside className="cp-sidebar">
        <button className="cp-brand" onClick={() => go("home")} aria-label="WineSnap hem">
          <span className="cp-brand-mark">
            <Utensils size={23} strokeWidth={1.5} />
          </span>
          <span>
            WineSnap<small>DITT KÖK. DIN SMAK.</small>
          </span>
        </button>
        <nav aria-label="Huvudnavigation">
          {navigation.map(({ id, text, icon: Icon }) => (
            <button
              key={id}
              className={activeNav === id ? "active" : ""}
              aria-label={text}
              aria-current={activeNav === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              <Icon size={21} strokeWidth={1.6} />
              <span>{text}</span>
              {id === "cook" && session && !session.complete && (
                <span className="cp-nav-dot" aria-label="Pågående provlagning" />
              )}
            </button>
          ))}
        </nav>
        <div className="cp-sidebar-bottom">
          <button className="cp-chef-link" onClick={() => openChat()}>
            <span className="cp-chef-avatar">
              <Sparkles size={20} />
            </span>
            <span>
              Din AI-kock<small>AI-exempel</small>
            </span>
            <ArrowUpRight size={17} />
          </button>
          <button className="cp-help-link" onClick={() => setModal("info")}>
            <CircleHelp size={17} /> Om prototypen
          </button>
          <p>MAT · MINNEN · VIN</p>
        </div>
      </aside>

      <div className="cp-workspace">
        <header className="cp-topbar">
          <button className="cp-mobile-brand" onClick={() => go("home")}>
            <Utensils size={21} />
            WineSnap
          </button>
          <p className="cp-date">
            {new Intl.DateTimeFormat("sv-SE", {
              weekday: "long",
              day: "numeric",
              month: "long",
            }).format(new Date())}
          </p>
          <div className="cp-topbar-actions">
            <button className="cp-prototype-label" onClick={() => setModal("info")}>
              <span /> Designprototyp<span className="cp-label-extra"> · Exempeldata</span>
              <CircleHelp size={14} />
            </button>
            <IconButton label="Min profil" onClick={() => go("you")}>
              <UserRound size={20} />
            </IconButton>
          </div>
        </header>
        <main
          id="chef-content"
          tabIndex={-1}
          className={`cp-content ${route === "chat" ? "cp-chat-page" : ""}`}
        >
          {route === "home" && (
            <>
              <section className="cp-welcome">
                <div>
                  <p className="cp-eyebrow">EN GOD STUND I KÖKET</p>
                  <h1>Vad lagar vi ikväll?</h1>
                  <p>Något enkelt, något nytt eller en favorit igen.</p>
                </div>
                <span className="cp-season">
                  <Sprout size={20} /> I säsong just nu
                </span>
              </section>
              <form
                className="cp-home-prompt"
                onSubmit={(event) => {
                  event.preventDefault();
                  openChat(undefined, false, question);
                }}
              >
                <Sparkles size={22} />
                <label className="cp-sr-only" htmlFor="home-question">
                  Vad vill du laga?
                </label>
                <input
                  id="home-question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Jag har citron och blomkål hemma…"
                  maxLength={1000}
                />
                <button
                  className="cp-round-send"
                  aria-label="Fråga AI-kocken"
                  title="Fråga AI-kocken"
                >
                  <ArrowUpRight size={22} />
                </button>
              </form>
              <div className="cp-start-actions">
                <button
                  onClick={() => {
                    setKitchenTab("ingredients");
                    go("kitchen");
                  }}
                >
                  <Sprout size={17} /> Utgå från råvaror
                  <ArrowUpRight size={15} />
                </button>
                <button onClick={() => go("wine")}>
                  <Wine size={17} /> Börja med ett vin
                  <ArrowUpRight size={15} />
                </button>
              </div>
              {session && !session.complete && (
                <button className="cp-resume" onClick={() => go("cook")}>
                  <CookingPot size={22} />
                  <span>
                    Fortsätt laga {cookingRecipe.shortTitle.toLocaleLowerCase("sv-SE")}
                    <small>
                      Steg {session.step + 1} av {cookingRecipe.steps.length}
                    </small>
                  </span>
                  <ArrowRight size={21} />
                </button>
              )}
              <section className="cp-hero">
                <img
                  src={recipes[0].image}
                  alt="Rostad blomkål på vit bönkräm med citron och persilja"
                  fetchPriority="high"
                />
                <div className="cp-hero-shade" />
                <div className="cp-hero-copy">
                  <p className="cp-eyebrow">EN IDÉ TILL MIDDAGEN</p>
                  <h2>
                    Lite citron.
                    <br />
                    Mycket gott.
                  </h2>
                  <p>Rostad blomkål med len bönkräm.</p>
                  <div className="cp-hero-meta">
                    <span>
                      <Clock3 size={16} /> 30 min
                    </span>
                    <span>
                      <Leaf size={16} /> Vegetariskt
                    </span>
                  </div>
                  <button
                    className="cp-button cp-button-light"
                    onClick={() => go("recipe/cauliflower")}
                  >
                    Se receptet
                    <ArrowUpRight size={18} />
                  </button>
                </div>
              </section>
              <section className="cp-band">
                <SectionHeading
                  eyebrow="ATT ÅTERVÄNDA TILL"
                  title="Något för din kokbok"
                  action="Visa alla"
                  onAction={() => {
                    setKitchenTab("cookbook");
                    go("kitchen");
                  }}
                />
                <div className="cp-recipe-grid">{recipeCards(recipes)}</div>
              </section>
              <section className="cp-memory-band">
                <div className="cp-memory-icon">
                  <BookOpen size={28} strokeWidth={1.4} />
                </div>
                <div>
                  <p className="cp-eyebrow">
                    {lastCooking ? "DIN PROVLAGNING" : "EXEMPEL UR MATMINNET"}
                  </p>
                  <h2>{lastCooking ?? "Goda idéer får leva vidare."}</h2>
                  <p>
                    {lastCooking
                      ? feedback.trim() || "Avslutad i den här förhandsvisningen."
                      : "Extra citron nästa gång. Mindre vitlök. En favorit att laga igen."}
                  </p>
                </div>
                <button className="cp-text-button" onClick={() => go("you")}>
                  Matprofilen
                  <ArrowUpRight size={18} />
                </button>
              </section>
            </>
          )}

          {route === "kitchen" && (
            <>
              <div className="cp-page-heading">
                <p className="cp-eyebrow">DITT EGET KÖK</p>
                <h1>{kitchenTab === "cookbook" ? "Din levande kokbok" : "Vad har du hemma?"}</h1>
                <p>
                  {kitchenTab === "cookbook"
                    ? "Nya idéer och rätter att göra till dina."
                    : "Börja med några råvaror. Resten tar vi därifrån."}
                </p>
              </div>
              <div
                className="cp-tabs"
                role="tablist"
                aria-label="Köksvyer"
                onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? "cookbook"
                      : event.key === "End"
                        ? "ingredients"
                        : kitchenTab === "cookbook"
                          ? "ingredients"
                          : "cookbook";
                  setKitchenTab(next);
                  document
                    .getElementById(next === "cookbook" ? "cookbook-tab" : "ingredients-tab")
                    ?.focus();
                }}
              >
                <button
                  id="cookbook-tab"
                  role="tab"
                  aria-selected={kitchenTab === "cookbook"}
                  tabIndex={kitchenTab === "cookbook" ? 0 : -1}
                  aria-controls="kitchen-panel"
                  onClick={() => setKitchenTab("cookbook")}
                >
                  <BookOpen size={18} /> Kokboken
                </button>
                <button
                  id="ingredients-tab"
                  role="tab"
                  aria-selected={kitchenTab === "ingredients"}
                  tabIndex={kitchenTab === "ingredients" ? 0 : -1}
                  aria-controls="kitchen-panel"
                  onClick={() => setKitchenTab("ingredients")}
                >
                  <Sprout size={18} /> Mina råvaror
                </button>
              </div>
              <section
                id="kitchen-panel"
                role="tabpanel"
                aria-labelledby={kitchenTab === "cookbook" ? "cookbook-tab" : "ingredients-tab"}
              >
                {kitchenTab === "cookbook" ? (
                  <>
                    <div className="cp-library-tools">
                      <label className="cp-search">
                        <Search size={19} />
                        <input
                          placeholder="Sök bland recepten"
                          aria-label="Sök bland recepten"
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                        />
                      </label>
                      <div className="cp-segments" aria-label="Filtrera recept">
                        {["Alla", "Sparade", "Snabbt"].map((item) => (
                          <button
                            key={item}
                            aria-pressed={filter === item}
                            onClick={() => setFilter(item)}
                          >
                            {item}
                            {item === "Sparade" && <span>{favorites.length}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="cp-small-label">{filteredRecipes.length} exempelrecept</p>
                    {filteredRecipes.length ? (
                      <div className="cp-recipe-grid cp-library-grid">
                        {recipeCards(filteredRecipes)}
                      </div>
                    ) : (
                      <div className="cp-empty">
                        <Search size={30} />
                        <h2>Inga recept här ännu</h2>
                        <p>Prova en annan sökning eller visa alla recept.</p>
                        <button
                          className="cp-button"
                          onClick={() => {
                            setSearch("");
                            setFilter("Alla");
                          }}
                        >
                          Visa alla
                          <ArrowRight size={18} />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="cp-workbench">
                      <div className="cp-workbench-main">
                        <p className="cp-eyebrow">PÅ KÖKSBÄNKEN</p>
                        <h2>Dina valda råvaror</h2>
                        <div className="cp-ingredient-chips">
                          {pantry.map((name) => (
                            <button
                              key={name}
                              onClick={() => {
                                setPantry((current) => current.filter((item) => item !== name));
                                setWorkbenchResults(false);
                              }}
                              title={`Ta bort ${name}`}
                            >
                              <Leaf size={17} />
                              {name}
                              <X size={15} />
                            </button>
                          ))}
                          {!pantry.length && <p className="cp-muted">Välj en råvara nedan.</p>}
                        </div>
                        <form
                          className="cp-add-ingredient"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const name = ingredient.trim();
                            if (
                              name &&
                              pantry.length < 12 &&
                              !pantry.some(
                                (item) =>
                                  item.toLocaleLowerCase("sv-SE") ===
                                  name.toLocaleLowerCase("sv-SE"),
                              )
                            )
                              setPantry((current) => [...current, name.slice(0, 40)]);
                            setIngredient("");
                            setWorkbenchResults(false);
                          }}
                        >
                          <input
                            value={ingredient}
                            onChange={(event) => setIngredient(event.target.value)}
                            maxLength={40}
                            placeholder="Lägg till en råvara"
                            aria-label="Lägg till en råvara"
                          />
                          <button
                            aria-label="Lägg till"
                            title="Lägg till"
                            disabled={!ingredient.trim() || pantry.length >= 12}
                          >
                            <Plus size={20} />
                          </button>
                        </form>
                        <p className="cp-small-label">KANSKE HAR DU OCKSÅ</p>
                        <div className="cp-suggestion-chips">
                          {ingredientSuggestions
                            .filter((name) => !pantry.includes(name))
                            .map((name) => (
                              <button
                                key={name}
                                onClick={() => {
                                  if (pantry.length < 12)
                                    setPantry((current) => [...current, name]);
                                  setWorkbenchResults(false);
                                }}
                              >
                                <Plus size={14} />
                                {name}
                              </button>
                            ))}
                        </div>
                      </div>
                      <aside className="cp-workbench-options">
                        <h3>
                          <Settings2 size={18} /> Middagen idag
                        </h3>
                        <label className="cp-range-label" htmlFor="cp-time">
                          Tid i köket<strong>{maxTime} min</strong>
                        </label>
                        <input
                          id="cp-time"
                          type="range"
                          min="15"
                          max="60"
                          step="5"
                          value={maxTime}
                          onChange={(event) => {
                            setMaxTime(Number(event.target.value));
                            setWorkbenchResults(false);
                          }}
                        />
                        <label className="cp-check-row">
                          <input
                            type="checkbox"
                            checked={useOven}
                            onChange={(event) => {
                              setUseOven(event.target.checked);
                              setWorkbenchResults(false);
                            }}
                          />{" "}
                          Jag kan använda ugnen
                        </label>
                        <div className="cp-workbench-summary">
                          <Leaf size={18} /> Vegetariska exempelrecept
                        </div>
                        {keto && <p className="cp-keto-note">Keto valt · näringsunderlag saknas</p>}
                        <button
                          className="cp-button"
                          disabled={!pantry.length}
                          onClick={() => setWorkbenchResults(true)}
                        >
                          <Sparkles size={18} />
                          Hitta något gott
                        </button>
                      </aside>
                    </div>
                    {workbenchResults && (
                      <section className="cp-band" aria-live="polite">
                        <SectionHeading
                          eyebrow="MATCHAT MOT EXEMPELRECEPTEN"
                          title={
                            workbenchRecipes.length
                              ? "Det här kan bli gott"
                              : "Vi behöver en råvara till"
                          }
                        />
                        {workbenchRecipes.length ? (
                          <div className="cp-recipe-grid">{recipeCards(workbenchRecipes)}</div>
                        ) : (
                          <p>
                            Inget exempelrecept matchar dina råvaror och tidsval. Prova citron,
                            pasta eller en längre tillagningstid.
                          </p>
                        )}
                      </section>
                    )}
                  </>
                )}
              </section>
            </>
          )}

          {route.startsWith("recipe/") && (
            <>
              <button
                className="cp-back"
                onClick={() => {
                  setKitchenTab("cookbook");
                  go("kitchen");
                }}
              >
                <ArrowLeft size={18} /> Kokboken
              </button>
              <section className="cp-recipe-detail">
                <div className="cp-detail-photo">
                  <img src={currentRecipe.image} alt={currentRecipe.shortTitle} />
                  <button
                    className="cp-save"
                    aria-label="Spara detta recept"
                    aria-pressed={favorites.includes(currentRecipe.id)}
                    onClick={() => favorite(currentRecipe.id)}
                  >
                    <Bookmark
                      size={20}
                      fill={favorites.includes(currentRecipe.id) ? "currentColor" : "none"}
                    />
                  </button>
                </div>
                <div className="cp-detail-intro">
                  <p className="cp-eyebrow">EXEMPELRECEPT · {currentRecipe.category}</p>
                  <h1>{currentRecipe.title}</h1>
                  <p>{currentRecipe.description}</p>
                  <div className="cp-detail-meta">
                    <span>
                      <Clock3 size={18} />
                      {currentRecipe.minutes} min
                    </span>
                    <span>
                      <Leaf size={18} />
                      Vegetariskt
                    </span>
                    <span>
                      <BookOpen size={18} />
                      Originalrecept
                    </span>
                  </div>
                  <div className="cp-detail-actions">
                    <button className="cp-button" onClick={() => startCooking(currentRecipe)}>
                      <CookingPot size={19} />{" "}
                      {session?.recipeId === currentRecipe.id && !session.complete
                        ? "Fortsätt laga"
                        : "Börja laga"}
                      <ArrowRight size={19} />
                    </button>
                    <button
                      className="cp-button cp-button-outline"
                      onClick={() => openChat(currentRecipe)}
                    >
                      <Sparkles size={18} /> Fråga kocken
                    </button>
                  </div>
                </div>
              </section>
              {keto && (
                <div className="cp-nutrition">
                  <Leaf size={23} />
                  <div>
                    <strong>Kolhydrater per portion</strong>
                    <p>Ej beräknat · näringsunderlag saknas för exempelreceptet.</p>
                  </div>
                  <span>Keto-läge</span>
                </div>
              )}
              <div className="cp-recipe-body">
                <section>
                  <SectionHeading title="Ingredienser" />
                  <Servings value={servings} onChange={setServings} />
                  <IngredientList
                    key={currentRecipe.id}
                    recipe={currentRecipe}
                    servings={servings}
                  />
                  <p className="cp-small-label">Salt och peppar efter smak.</p>
                </section>
                <section>
                  <SectionHeading title="Så gör du" />
                  <ol className="cp-method-list">
                    {currentRecipe.steps.map((step, index) => (
                      <li key={step.title}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <div>
                          <h3>{step.title}</h3>
                          <p>{step.text}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
              <section className="cp-recipe-tail">
                <div>
                  <Lightbulb size={22} />
                  <h3>Din nästa version börjar här.</h3>
                  <p>Original · inga egna ändringar ännu</p>
                </div>
                <button
                  className="cp-text-button"
                  onClick={() => openChat(currentRecipe, false, "Vad kan jag byta ut?")}
                >
                  Bolla ett byte
                  <ArrowUpRight size={18} />
                </button>
              </section>
            </>
          )}

          {route === "cook" && (!session || session.complete) && (
            <>
              <div className="cp-page-heading">
                <p className="cp-eyebrow">EN SAK I TAGET</p>
                <h1>Vad ska vi laga?</h1>
                <p>Välj en rätt att ta med till köksbänken.</p>
              </div>
              <div className="cp-recipe-grid">{recipeCards(recipes)}</div>
            </>
          )}
          {route === "cook" && session && !session.complete && (
            <>
              <div className="cp-cook-heading">
                <button className="cp-back" onClick={() => go(`recipe/${cookingRecipe.id}`)}>
                  <ArrowLeft size={18} /> Receptet
                </button>
                <span className="cp-small-label">LOKAL PROVLAGNING</span>
                <IconButton label="Om provlagningen" onClick={() => setModal("info")}>
                  <CircleHelp size={19} />
                </IconButton>
              </div>
              <div className="cp-cook-title">
                <div>
                  <p className="cp-eyebrow">NU LAGAR VI</p>
                  <h1>{cookingRecipe.shortTitle}</h1>
                </div>
                <span>
                  <UsersRound size={18} /> {session.servings} portioner
                </span>
              </div>
              <div
                className="cp-step-track"
                aria-label={`Steg ${session.step + 1} av ${cookingRecipe.steps.length}`}
              >
                {cookingRecipe.steps.map((step, index) => (
                  <button
                    key={step.title}
                    title={`Steg ${index + 1}: ${step.title}`}
                    aria-label={`Gå till steg ${index + 1}`}
                    aria-current={index === session.step ? "step" : undefined}
                    onClick={() => setSession({ ...session, step: index })}
                    className={index <= session.step ? "reached" : ""}
                  />
                ))}
              </div>
              <div className="cp-cook-grid">
                <section className="cp-current-step">
                  <p className="cp-eyebrow">
                    STEG {String(session.step + 1).padStart(2, "0")}{" "}
                    <span>/ {String(cookingRecipe.steps.length).padStart(2, "0")}</span>
                  </p>
                  <h2>{activeStep.title}</h2>
                  <p className="cp-step-instruction">{activeStep.text}</p>
                  {activeStep.minutes && (
                    <button className="cp-timer-preset" onClick={openTimer}>
                      <Timer size={20} /> Timer · {activeStep.minutes} min
                      <Plus size={18} />
                    </button>
                  )}
                  <button className="cp-cook-help" onClick={() => openChat(cookingRecipe, true)}>
                    <Sparkles size={22} />
                    <span>En fråga mitt i matlagningen?</span>
                    <ArrowUpRight size={20} />
                  </button>
                  <div className="cp-step-controls">
                    <button
                      className="cp-button cp-button-outline"
                      disabled={session.step === 0}
                      onClick={() => setSession({ ...session, step: session.step - 1 })}
                    >
                      <ArrowLeft size={19} />
                      <span>Föregående</span>
                    </button>
                    <button
                      className="cp-button"
                      onClick={() =>
                        session.step === cookingRecipe.steps.length - 1
                          ? (setRating(null), setFeedback(""), setModal("feedback"))
                          : setSession({ ...session, step: session.step + 1 })
                      }
                    >
                      {session.step === cookingRecipe.steps.length - 1
                        ? "Klart för servering"
                        : "Nästa steg"}
                      {session.step === cookingRecipe.steps.length - 1 ? (
                        <Check size={19} />
                      ) : (
                        <ArrowRight size={19} />
                      )}
                    </button>
                  </div>
                </section>
                <aside className="cp-cook-aside">
                  <div className="cp-timers-heading">
                    <h2>
                      <Timer size={20} /> Mina timers
                    </h2>
                    <IconButton
                      label="Lägg till timer"
                      disabled={timers.length >= 4}
                      onClick={openTimer}
                    >
                      <Plus size={20} />
                    </IconButton>
                  </div>
                  {!timers.length && <p className="cp-timer-empty">Ingen timer igång</p>}
                  <div className="cp-timers">
                    {timers.map((timer) => (
                      <article
                        key={timer.id}
                        className={remainingMs(timer, now) === 0 ? "cp-timer is-done" : "cp-timer"}
                      >
                        <div>
                          <span>{timer.name}</span>
                          <strong role="timer" aria-label={timer.name}>
                            {timerText(remainingMs(timer, now))}
                          </strong>
                          <small>
                            {remainingMs(timer, now) === 0
                              ? "Tiden är ute"
                              : timer.deadline === null
                                ? "Pausad"
                                : "Pågår"}
                          </small>
                        </div>
                        <div className="cp-timer-controls">
                          <IconButton
                            label={
                              remainingMs(timer, now) === 0
                                ? `Starta om ${timer.name}`
                                : timer.deadline === null
                                  ? `Fortsätt ${timer.name}`
                                  : `Pausa ${timer.name}`
                            }
                            onClick={() => {
                              const time = Date.now();
                              setNow(time);
                              setTimers((current) =>
                                current.map((item) =>
                                  item.id !== timer.id
                                    ? item
                                    : remainingMs(item, time) === 0
                                      ? {
                                          ...item,
                                          deadline: time + item.durationMs,
                                          pausedMs: item.durationMs,
                                        }
                                      : toggleTimer(item, time),
                                ),
                              );
                            }}
                          >
                            {remainingMs(timer, now) === 0 ? (
                              <RotateCcw size={17} />
                            ) : timer.deadline === null ? (
                              <Play size={17} />
                            ) : (
                              <Pause size={17} />
                            )}
                          </IconButton>
                          <IconButton
                            label={`Ta bort ${timer.name}`}
                            onClick={() =>
                              setTimers((current) => current.filter((item) => item.id !== timer.id))
                            }
                          >
                            <X size={17} />
                          </IconButton>
                        </div>
                      </article>
                    ))}
                  </div>
                  <details className="cp-cook-ingredients" open>
                    <summary>
                      Ingredienser
                      <ChevronRight size={18} />
                    </summary>
                    <IngredientList
                      key={`cook-${session.recipeId}`}
                      recipe={cookingRecipe}
                      servings={session.servings}
                    />
                  </details>
                </aside>
              </div>
            </>
          )}

          {route === "wine" && (
            <>
              <div className="cp-page-heading">
                <p className="cp-eyebrow">GOTT TILLSAMMANS</p>
                <h1>Matens bästa sällskap.</h1>
                <p>Vinet har fortfarande en självklar plats vid bordet.</p>
              </div>
              <section className="cp-wine-feature">
                <img src={wineImage} alt="Illustration från WineSnaps vindel" />
                <div>
                  <Wine size={28} strokeWidth={1.4} />
                  <p className="cp-eyebrow">VINSOMMELIEREN</p>
                  <h2>
                    En god rätt.
                    <br />
                    Ett passande glas.
                  </h2>
                  <p>Utgå från maten eller låt ett vin ge middagen en riktning.</p>
                  <button className="cp-button cp-button-light" onClick={() => setModal("wine")}>
                    Välj ett exempelvin
                    <ArrowUpRight size={18} />
                  </button>
                </div>
              </section>
              <section className="cp-band">
                <SectionHeading eyebrow="EXEMPEL PÅ SMAKPAR" title="Från glaset till tallriken" />
                <div className="cp-wine-pairing">
                  <span className="cp-wine-glyph">
                    <Wine size={30} strokeWidth={1.3} />
                  </span>
                  <div>
                    <p className="cp-small-label">FRISKT VITT · CITRUS & MJUK FRUKT</p>
                    <h3>Chardonnay & Weisser Burgunder</h3>
                    <p>Ett smakexempel till citron, rostad blomkål och bönkräm.</p>
                  </div>
                  <button className="cp-text-button" onClick={() => go("recipe/cauliflower")}>
                    Till receptet
                    <ArrowRight size={18} />
                  </button>
                </div>
              </section>
              <div className="cp-legacy-links">
                <a
                  href="https://wine-scene-snap.lovable.app/cellar"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Wine size={20} />
                  <span>
                    Nuvarande vinkällare<small>Öppnas i WineSnap</small>
                  </span>
                  <ArrowUpRight size={18} />
                </a>
                <a href="https://wine-scene-snap.lovable.app/scan" target="_blank" rel="noreferrer">
                  <Camera size={20} />
                  <span>
                    Skanna ett vin<small>Öppnas i WineSnap</small>
                  </span>
                  <ArrowUpRight size={18} />
                </a>
              </div>
            </>
          )}

          {route === "you" && (
            <>
              <div className="cp-page-heading">
                <p className="cp-eyebrow">DU SÄTTER SMAKEN</p>
                <h1>Ditt kök, på ditt sätt.</h1>
                <p>Exempelprofil · inga kontouppgifter är anslutna.</p>
              </div>
              <section className="cp-profile-section">
                <SectionHeading title="Min matprofil" />
                <p className="cp-muted">Exempelminnen</p>
                <div className="cp-memory-list">
                  {memories.map((memory) => (
                    <article key={memory.id}>
                      <div className="cp-memory-symbol">
                        <Leaf size={21} />
                      </div>
                      <div className="cp-memory-content">
                        {editingMemory === memory.id ? (
                          <form
                            onSubmit={(event) => {
                              event.preventDefault();
                              if (!memoryText.trim()) return;
                              setMemories((current) =>
                                current.map((item) =>
                                  item.id === memory.id
                                    ? { ...item, title: memoryText.trim(), confirmed: true }
                                    : item,
                                ),
                              );
                              setEditingMemory(null);
                            }}
                          >
                            <label className="cp-sr-only" htmlFor="memory-text">
                              Ändra exempelminne
                            </label>
                            <input
                              id="memory-text"
                              value={memoryText}
                              onChange={(event) => setMemoryText(event.target.value)}
                              maxLength={120}
                              autoFocus
                            />
                            <button className="cp-text-button" type="submit">
                              <Check size={17} />
                              Spara ändring
                            </button>
                          </form>
                        ) : (
                          <>
                            <h3>{memory.title}</h3>
                            <p>{memory.source}</p>
                            <span
                              className={`cp-memory-status ${memory.confirmed ? "confirmed" : ""}`}
                            >
                              {memory.confirmed ? <Check size={14} /> : <CircleHelp size={14} />}
                              {memory.confirmed ? "Bekräftat exempel" : "Väntar på bekräftelse"}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="cp-memory-actions">
                        {!memory.confirmed && (
                          <IconButton
                            label={`Bekräfta: ${memory.title}`}
                            onClick={() =>
                              setMemories((current) =>
                                current.map((item) =>
                                  item.id === memory.id ? { ...item, confirmed: true } : item,
                                ),
                              )
                            }
                          >
                            <Check size={18} />
                          </IconButton>
                        )}
                        <IconButton
                          label={`Ändra: ${memory.title}`}
                          onClick={() => {
                            setEditingMemory(memory.id);
                            setMemoryText(memory.title);
                          }}
                        >
                          <Pencil size={17} />
                        </IconButton>
                        <IconButton
                          label={`Glöm: ${memory.title}`}
                          onClick={() =>
                            setMemories((current) =>
                              current.filter((item) => item.id !== memory.id),
                            )
                          }
                        >
                          <Trash2 size={17} />
                        </IconButton>
                      </div>
                    </article>
                  ))}
                  {!memories.length && (
                    <div className="cp-empty">
                      <BookOpen size={28} />
                      <h3>Inga exempelminnen kvar</h3>
                      <button
                        className="cp-text-button"
                        onClick={() => setMemories(initialMemories)}
                      >
                        <RotateCcw size={17} />
                        Återställ exemplen
                      </button>
                    </div>
                  )}
                </div>
              </section>
              <section className="cp-profile-section">
                <SectionHeading title="Kostpreferenser" />
                <label className="cp-switch-row">
                  <span>
                    <strong>Frivilligt Keto-läge</strong>
                    <small>Exempelvy för receptens kolhydrater</small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label="Keto-läge"
                    checked={keto}
                    onChange={(event) => setKeto(event.target.checked)}
                  />
                  <span className="cp-switch-track" aria-hidden="true" />
                </label>
                {keto && (
                  <div className="cp-keto-detail">
                    <Leaf size={22} />
                    <div>
                      <h3>Keto-läge är valt</h3>
                      <p>
                        Inga hälsouppgifter samlas in. Recept utan näringsunderlag visar inget
                        beräknat värde.
                      </p>
                      <button className="cp-text-button" onClick={() => go("recipe/cauliflower")}>
                        Se ett receptexempel
                        <ArrowUpRight size={17} />
                      </button>
                    </div>
                  </div>
                )}
              </section>
              <section className="cp-profile-section cp-profile-footer">
                <button className="cp-text-button" onClick={() => setModal("info")}>
                  <CircleHelp size={18} />
                  Om designprototypen
                </button>
                <span>WineSnap · Exempeldata</span>
              </section>
            </>
          )}

          {route === "chat" && (
            <>
              <div className="cp-chat-heading">
                <IconButton
                  label="Tillbaka från AI-kocken"
                  onClick={() =>
                    go(
                      chatContext.cooking
                        ? "cook"
                        : contextualRecipe
                          ? `recipe/${contextualRecipe.id}`
                          : "home",
                    )
                  }
                >
                  <ArrowLeft size={21} />
                </IconButton>
                <div>
                  <h1>Din AI-kock</h1>
                  <p>Förskrivna svar · inte ansluten till AI</p>
                </div>
                <IconButton
                  label="Ny exempelkonversation"
                  onClick={() => {
                    setMessages([]);
                    setQuestion("");
                  }}
                >
                  <Pencil size={20} />
                </IconButton>
              </div>
              {contextualRecipe && (
                <div className="cp-chat-context">
                  <img src={contextualRecipe.image} alt="" />
                  <span>
                    {contextualRecipe.shortTitle}
                    {chatContext.cooking && (
                      <small>Matlagning · steg {(session?.step ?? 0) + 1}</small>
                    )}
                  </span>
                  <CookingPot size={19} />
                </div>
              )}
              <div className="cp-chat-scroll">
                {!messages.length ? (
                  <div className="cp-chat-intro">
                    <span className="cp-chat-sparkle">
                      <Sparkles size={32} strokeWidth={1.3} />
                    </span>
                    <p className="cp-eyebrow">EN IDÉ ATT BOLLA?</p>
                    <h2>
                      {chatContext.cooking
                        ? "Jag är med vid köksbänken."
                        : contextualRecipe
                          ? "Ska vi göra receptet till ditt?"
                          : "Vad är du sugen på?"}
                    </h2>
                    <p>
                      {contextualRecipe
                        ? contextualRecipe.shortTitle
                        : "Börja med en råvara, en rätt eller en känsla."}
                    </p>
                    <div className="cp-chat-prompts">
                      {(contextualRecipe
                        ? ["Vad kan jag byta ut?", "Vilket vin passar?", "Vad gör jag härnäst?"]
                        : [
                            "En enkel middag ikväll",
                            "Vad finns i exempelminnet?",
                            "Något gott till ett vitt vin",
                          ]
                      ).map((prompt) => (
                        <button key={prompt} onClick={() => ask(undefined, prompt)}>
                          {prompt}
                          <ArrowUpRight size={17} />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="cp-messages">
                    {messages.map((message, index) => (
                      <article key={index} className={`cp-message cp-message-${message.role}`}>
                        {message.role === "assistant" && (
                          <span className="cp-message-icon">
                            <Sparkles size={19} />
                          </span>
                        )}
                        <div>
                          {message.role === "assistant" && (
                            <p className="cp-small-label">AI-EXEMPEL</p>
                          )}
                          <p>{message.text}</p>
                          {message.role === "assistant" && (
                            <button
                              className="cp-text-button"
                              onClick={() => go(`recipe/${contextualRecipe?.id ?? "cauliflower"}`)}
                            >
                              Öppna receptet
                              <ArrowUpRight size={16} />
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                <div ref={chatEnd} />
              </div>
              <form className="cp-chat-composer" onSubmit={ask}>
                <label className="cp-sr-only" htmlFor="chef-question">
                  Fråga kocken
                </label>
                <textarea
                  id="chef-question"
                  rows={2}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Fråga om en råvara, ett byte eller nästa steg…"
                  maxLength={1000}
                />
                <button
                  className="cp-round-send"
                  aria-label="Skicka fråga"
                  title="Skicka fråga"
                  disabled={!question.trim()}
                >
                  <Send size={20} />
                </button>
              </form>
            </>
          )}
        </main>
        {route !== "chat" && (
          <footer className="cp-page-footer">
            <span>WineSnap</span>
            <span>EN GOD IDÉ TILL NÄSTA MIDDAG.</span>
            <button onClick={() => setModal("info")}>
              Designprototyp
              <ArrowUpRight size={14} />
            </button>
          </footer>
        )}
      </div>
      <nav className="cp-mobile-nav" aria-label="Mobilnavigation">
        {navigation.map(({ id, text, icon: Icon }) => (
          <button
            key={id}
            className={activeNav === id ? "active" : ""}
            aria-label={text}
            aria-current={activeNav === id ? "page" : undefined}
            onClick={() => go(id)}
          >
            <span>
              <Icon size={23} strokeWidth={1.65} />
              {id === "cook" && session && !session.complete && <i />}
            </span>
            <small>{text}</small>
          </button>
        ))}
      </nav>
      {notice && (
        <div role="status" className="cp-notice">
          <Check size={19} />
          <span>{notice}</span>
          <IconButton label="Stäng meddelande" onClick={() => setNotice("")}>
            <X size={17} />
          </IconButton>
        </div>
      )}
      {modal === "replace-session" && (
        <Dialog title="Starta en annan provlagning?" onClose={() => setModal(null)}>
          <p>
            Din pågående provlagning och dess timers avslutas om du byter recept. Ingen riktig
            matlagningshistorik påverkas.
          </p>
          <div className="cp-detail-actions">
            <button className="cp-button cp-button-outline" onClick={() => setModal(null)}>
              Avbryt
            </button>
            <button
              className="cp-button"
              onClick={() => {
                const next = recipes.find((recipe) => recipe.id === pendingRecipe);
                if (next) startCooking(next, true);
                setModal(null);
              }}
            >
              Starta ny provlagning
              <ArrowRight size={18} />
            </button>
          </div>
        </Dialog>
      )}
      {modal === "info" && (
        <Dialog title="En förhandstitt på ditt nya kök" onClose={() => setModal(null)}>
          <p>
            Designprototyp med exempelrecept, exempelminnen och förskrivna AI-svar. Inget sparas i
            ditt WineSnap-konto och inga AI-anrop görs.
          </p>
          <p>
            Val, provlagning och timers finns bara i den här öppna sidan och återställs vid
            omladdning. Timers har inget bakgrundslarm. Receptbilderna är illustrationer.
          </p>
          <button className="cp-button" onClick={() => setModal(null)}>
            Tillbaka till köket
            <ArrowRight size={18} />
          </button>
        </Dialog>
      )}
      {modal === "timer" && (
        <Dialog title="En sak mindre att hålla koll på" onClose={() => setModal(null)}>
          <form className="cp-dialog-form" onSubmit={addTimer}>
            <label htmlFor="timer-name">
              Namn
              <input
                id="timer-name"
                value={timerName}
                maxLength={50}
                onChange={(event) => setTimerName(event.target.value)}
                required
              />
            </label>
            <label htmlFor="timer-minutes">
              Minuter
              <input
                id="timer-minutes"
                type="number"
                min="1"
                max="180"
                step="1"
                value={timerMinutes}
                onChange={(event) => setTimerMinutes(Number(event.target.value))}
                required
              />
            </label>
            {formError && <p role="alert">{formError}</p>}
            <button className="cp-button" type="submit">
              <Play size={18} />
              Starta timer
            </button>
          </form>
        </Dialog>
      )}
      {modal === "feedback" && (
        <Dialog title="Hur blev det?" onClose={() => setModal(null)}>
          <form className="cp-dialog-form" onSubmit={submitFeedback}>
            <p>{cookingRecipe.shortTitle} · lokal provlagning</p>
            <div className="cp-rating" role="group" aria-label="Betyg">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`${value} av 5`}
                  aria-pressed={rating === value}
                  onClick={() => setRating(value)}
                >
                  <Star
                    size={30}
                    fill={rating !== null && value <= rating ? "currentColor" : "none"}
                  />
                </button>
              ))}
            </div>
            <label htmlFor="cook-feedback">
              Till nästa gång
              <textarea
                id="cook-feedback"
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                maxLength={400}
                placeholder="Lite mer citron, kanske?"
                rows={3}
              />
            </label>
            <button className="cp-button" disabled={rating === null}>
              <Check size={18} />
              Avsluta provlagningen
            </button>
          </form>
        </Dialog>
      )}
      {modal === "wine" && (
        <Dialog title="Ett glas till middagen" onClose={() => setModal(null)}>
          <p className="cp-small-label">EXEMPELVIN · INTE DIN RIKTIGA VINKÄLLARE</p>
          <h3>Chardonnay & Weisser Burgunder</h3>
          <p>
            Frisk syra, citrus och mjuk frukt som smakexempel till rostad blomkål. Matchningen är
            illustrativ.
          </p>
          <button
            className="cp-button"
            onClick={() => {
              setModal(null);
              go("recipe/cauliflower");
            }}
          >
            Se maträtten
            <ArrowRight size={18} />
          </button>
        </Dialog>
      )}
    </div>
  );
}
