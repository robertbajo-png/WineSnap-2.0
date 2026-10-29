import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChefHat, FilePenLine, Loader2, Plus, Send, Sparkles } from "lucide-react";
import { ChatMessageContent } from "@/components/ChatMessageContent";
import type { RecipeDocument } from "../kitchen/domain";
import { emptyChefContext, type ChefContext, type ChefRequest } from "./domain";
import { askChef, chefConversations, chefMessages, type ChefResult } from "./api";
import "./chef.css";

export type ChefOpening = {
  mode: "chat" | "generate" | "adapt";
  context: ChefContext;
  title: string;
  initialPrompt?: string;
  initialServings?: number;
};
export function ChefPanel({
  owner,
  opening,
  offline,
  onReview,
}: {
  owner: string;
  opening: ChefOpening;
  offline: boolean;
  onReview: (draft: RecipeDocument) => void;
}) {
  const [mode, setMode] = useState(opening.mode);
  const [prompt, setPrompt] = useState(opening.initialPrompt ?? "");
  const [servings, setServings] = useState(opening.initialServings ?? 2),
    [minutes, setMinutes] = useState(30);
  const [conversation, setConversation] = useState({
    id: crypto.randomUUID() as string,
    revision: 0,
  });
  const [conversations, setConversations] = useState<Awaited<ReturnType<typeof chefConversations>>>(
    [],
  );
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [result, setResult] = useState<ChefResult | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const live = useRef(true),
    controller = useRef<AbortController | null>(null);
  const pending = useRef<{ key: string; input: ChefRequest } | null>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (!offline)
      void chefConversations(owner)
        .then((rows) => {
          if (active) setConversations(rows);
        })
        .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [owner, offline]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || offline) return;
    setBusy(true);
    setError("");
    setResult(null);
    const context = opening.context ?? emptyChefContext;
    const data =
      mode === "chat"
        ? {
            action: mode,
            message: prompt,
            conversationId: conversation.id,
            conversationRevision: conversation.revision,
            context,
          }
        : { action: mode, prompt, servings, maxMinutes: minutes, context };
    const key = JSON.stringify(data);
    const input =
      pending.current?.key === key
        ? pending.current.input
        : ({ ...data, requestId: crypto.randomUUID() } as ChefRequest);
    pending.current = { key, input };
    controller.current = new AbortController();
    try {
      const answer = await askChef(input, owner, controller.current.signal);
      if (!live.current) return;
      setResult(answer);
      if (mode === "chat") {
        setMessages((rows) => [
          ...rows,
          { role: "user", content: prompt },
          { role: "assistant", content: answer.answer ?? "" },
        ]);
        setConversation((c) => ({ ...c, revision: c.revision + 1 }));
        setPrompt("");
      }
      pending.current = null;
      setConversations(await chefConversations(owner));
    } catch (cause) {
      if (live.current) setError(cause instanceof Error ? cause.message : "Kunde inte hämta svar.");
    } finally {
      if (live.current) setBusy(false);
    }
  }
  async function resume(id: string) {
    setBusy(true);
    setError("");
    try {
      const row = conversations.find((c) => c.id === id);
      if (row) {
        const history = await chefMessages(owner, id);
        if (!live.current) return;
        setMessages(history);
        setConversation(row);
        setResult(null);
        pending.current = null;
      }
    } catch {
      if (live.current) setError("Samtalet kunde inte hämtas.");
    } finally {
      if (live.current) setBusy(false);
    }
  }
  return (
    <section className="chef-panel" aria-labelledby="chef-title">
      <div className="k-title-row">
        <div>
          <p className="k-eyebrow">Köket</p>
          <h1 id="chef-title">AI-kocken</h1>
        </div>
        <ChefHat size={30} />
      </div>
      <p className="chef-context">{opening.title || "Ditt kök"}</p>
      <div className="chef-modes" role="group" aria-label="AI-uppgift">
        <button
          aria-pressed={mode === "chat"}
          disabled={busy}
          onClick={() => {
            setMode("chat");
            setResult(null);
          }}
        >
          Fråga
        </button>
        <button
          aria-pressed={mode === "generate"}
          disabled={busy}
          onClick={() => {
            setMode("generate");
            setResult(null);
          }}
        >
          Skapa recept
        </button>
        {!!opening.context.recipeVersionId && (
          <button
            aria-pressed={mode === "adapt"}
            disabled={busy}
            onClick={() => {
              setMode("adapt");
              setResult(null);
            }}
          >
            Anpassa
          </button>
        )}
      </div>
      {mode === "chat" && (
        <>
          <div className="chef-history">
            <label>
              Samtal
              <select
                aria-label="Samtal"
                disabled={busy || offline}
                value={conversations.some((c) => c.id === conversation.id) ? conversation.id : ""}
                onChange={(e) => {
                  if (e.target.value) void resume(e.target.value);
                }}
              >
                <option value="">Nytt samtal</option>
                {conversations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="k-icon"
              title="Nytt samtal"
              aria-label="Nytt samtal"
              disabled={busy}
              onClick={() => {
                setConversation({ id: crypto.randomUUID(), revision: 0 });
                setMessages([]);
                setResult(null);
                pending.current = null;
              }}
            >
              <Plus size={20} />
            </button>
          </div>
          <div
            className="chef-messages"
            role="log"
            aria-label="Samtal med AI-kocken"
            aria-live="polite"
          >
            {!messages.length && <p className="chef-empty">Vad vill du laga?</p>}
            {messages.map((m, i) => (
              <article key={i} className={`chef-message ${m.role}`}>
                <strong>{m.role === "user" ? "Du" : "AI-kocken"}</strong>
                <ChatMessageContent role={m.role} content={m.content} normalizeHeadings />
              </article>
            ))}
          </div>
        </>
      )}
      <form onSubmit={(e) => void submit(e)}>
        <label>
          {mode === "chat" ? "Din fråga" : "Vad ska receptet innehålla eller ändra?"}
          <textarea
            aria-label={mode === "chat" ? "Din fråga" : "Vad ska receptet innehålla eller ändra?"}
            value={prompt}
            required
            maxLength={2000}
            rows={3}
            disabled={busy || offline}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>
        {mode !== "chat" && (
          <div className="k-form-row">
            <label>
              Portioner
              <input
                type="number"
                min={1}
                max={24}
                required
                value={servings}
                disabled={busy}
                onChange={(e) => setServings(Number(e.target.value))}
              />
            </label>
            <label>
              Högst minuter
              <input
                type="number"
                min={5}
                max={240}
                required
                value={minutes}
                disabled={busy}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </label>
          </div>
        )}
        <button className="k-primary" disabled={busy || offline || !prompt.trim()}>
          {busy ? (
            <Loader2 className="animate-spin" size={18} />
          ) : mode === "chat" ? (
            <Send size={18} />
          ) : (
            <Sparkles size={18} />
          )}
          {busy ? "Arbetar…" : mode === "chat" ? "Skicka" : "Ta fram förslag"}
        </button>
      </form>
      {offline && (
        <p role="status">AI-kocken behöver internet. Cook Mode fungerar fortfarande offline.</p>
      )}
      {error && (
        <p className="k-error" role="alert">
          {error}
        </p>
      )}
      {result?.draft && (
        <section className="chef-draft">
          <p className="k-eyebrow">Ej sparat</p>
          <h2>{result.draft.title}</h2>
          <p>{result.draft.description}</p>
          <p>
            {result.draft.totalMinutes} min · {result.draft.servings} portioner
          </p>
          <ul>
            {result.draft.ingredients.map((i) => (
              <li key={i.id}>{i.name}</li>
            ))}
          </ul>
          <button className="k-primary" onClick={() => onReview(result.draft!)}>
            <FilePenLine size={18} />
            Granska recept
          </button>
        </section>
      )}
      {result && (
        <p className="chef-meta">
          {result.model ?? "Säkerhetskontroll utan AI-anrop"}
          {result.model && (
            <>
              {" "}
              · {(result.durationMs / 1000).toFixed(1)} s · {result.inputTokens ?? "?"} in /{" "}
              {result.outputTokens ?? "?"} ut-token
            </>
          )}
        </p>
      )}
    </section>
  );
}
