import { createFileRoute, Link } from "@tanstack/react-router";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Clock3,
  History,
  Loader2,
  MessageCircleMore,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Wine,
  X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n, useT } from "@/i18n";
import { sanitizeAskContext, validateAskMessage, type AskWineSnapContext } from "@/lib/askWineSnap";
import { cn } from "@/lib/utils";

type AskSearch = { wineId?: string; source?: AskWineSnapContext["source"] };

export const Route = createFileRoute("/ask")({
  validateSearch: (search: Record<string, unknown>): AskSearch => {
    const context = sanitizeAskContext({
      wineId: typeof search.wineId === "string" ? search.wineId : undefined,
      source:
        typeof search.source === "string" ? (search.source as AskWineSnapContext["source"]) : "ask",
      route: "/ask",
    });
    return {
      ...(context.wineId ? { wineId: context.wineId } : {}),
      ...(search.source ? { source: context.source } : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "Ask WineSnap — Personal sommelier" },
      { name: "description", content: "Ask WineSnap about wine, pairings, and your cellar." },
    ],
  }),
  component: AskWineSnapPage,
});

type Conversation = {
  id: string;
  title: string;
  last_message_at: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

function AskWineSnapPage() {
  const { user, loading } = useAuth();
  const { lang } = useI18n();
  const t = useT();
  const search = Route.useSearch();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const context = useMemo(
    () =>
      sanitizeAskContext({
        source: search.source ?? (search.wineId ? "wine" : "ask"),
        wineId: search.wineId,
        route: search.wineId ? `/wine/${search.wineId}` : "/ask",
      }),
    [search.source, search.wineId],
  );

  const loadConversations = async () => {
    if (!user) return;
    const { data, error: loadError } = await supabase
      .from("ai_conversations")
      .select("id,title,last_message_at")
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false })
      .limit(30);
    if (loadError) setError(t("ask.error.generic"));
    else setConversations((data as Conversation[]) ?? []);
  };

  useEffect(() => {
    void loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const openConversation = async (conversation: Conversation) => {
    setActiveId(conversation.id);
    setHistoryOpen(false);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("ai_messages")
      .select("id,role,content,created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true });
    if (loadError) setError(t("ask.error.generic"));
    else setMessages(((data as Message[]) ?? []).filter((message) => message.role !== undefined));
  };

  const startNew = () => {
    setActiveId(null);
    setMessages([]);
    setInput("");
    setError(null);
    setHistoryOpen(false);
  };

  const removeConversation = async (conversation: Conversation) => {
    if (!window.confirm(t("ask.deleteConfirm"))) return;
    const { error: deleteError } = await supabase
      .from("ai_conversations")
      .delete()
      .eq("id", conversation.id);
    if (deleteError) {
      setError(t("ask.error.generic"));
      return;
    }
    if (activeId === conversation.id) startNew();
    setConversations((current) => current.filter((item) => item.id !== conversation.id));
  };

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!user || busy) return;
    const validation = validateAskMessage(input);
    if (!validation.valid) {
      setError(t(validation.error === "empty" ? "ask.error.empty" : "ask.error.long"));
      return;
    }

    const text = validation.value;
    const optimisticId = `pending-${Date.now()}`;
    setMessages((current) => [
      ...current,
      { id: optimisticId, role: "user", content: text, created_at: new Date().toISOString() },
    ]);
    setInput("");
    setBusy(true);
    setError(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke("ask-winesnap", {
        body: {
          conversationId: activeId,
          message: text,
          context,
          language: lang,
        },
      });
      if (functionError) throw functionError;
      if (data?.error) throw new Error(data.error);

      const response = data?.message as Message | undefined;
      if (!response?.id || !response.content) throw new Error("Missing answer");
      setActiveId(data.conversationId as string);
      setMessages((current) => [...current, response]);
      await loadConversations();
    } catch (sendError) {
      setMessages((current) => current.filter((message) => message.id !== optimisticId));
      setInput(text);
      setError(
        sendError instanceof Error && sendError.message
          ? sendError.message
          : t("ask.error.generic"),
      );
    } finally {
      setBusy(false);
    }
  };

  if (!loading && !user) {
    return (
      <AppShell>
        <div className="mt-20 text-center">
          <MessageCircleMore className="mx-auto h-9 w-9 text-gold" />
          <p className="mt-4 text-muted-foreground">{t("ask.signIn")}</p>
          <Button asChild className="mt-4 bg-gradient-burgundy text-cream">
            <Link to="/login">{t("login.signIn")}</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 flex min-h-[calc(100vh-7rem)] flex-col px-5 pt-3">
        <header className="flex items-start justify-between gap-3 border-b border-white/8 pb-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl text-gold">{t("ask.title")}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("ask.subtitle")}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t("ask.history")}
              onClick={() => setHistoryOpen((open) => !open)}
            >
              {historyOpen ? <X className="h-5 w-5" /> : <History className="h-5 w-5" />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t("ask.new")}
              onClick={startNew}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {historyOpen && (
          <section aria-label={t("ask.history")} className="border-b border-white/8 py-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium text-cream">{t("ask.history")}</h2>
              <Button asChild variant="ghost" size="sm" className="h-8 text-gold">
                <Link to="/for-you">
                  <Sparkles className="h-4 w-4" /> {t("ask.recommendations")}
                </Link>
              </Button>
            </div>
            {!conversations.length ? (
              <p className="py-3 text-xs text-muted-foreground">{t("ask.noHistory")}</p>
            ) : (
              <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
                {conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5",
                      activeId === conversation.id ? "bg-burgundy/20" : "hover:bg-white/5",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => void openConversation(conversation)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm text-foreground">
                        {conversation.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock3 className="h-3 w-3" />
                        {new Date(conversation.last_message_at).toLocaleDateString()}
                      </span>
                    </button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t("ask.delete")}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => void removeConversation(conversation)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="flex-1 py-5">
          {context.wineId && (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-gold/25 bg-gold/5 px-3 py-2 text-xs text-gold">
              <Wine className="h-4 w-4" />
              <span className="flex-1">{t("ask.contextWine")}</span>
              <Link
                to="/wine/$id"
                params={{ id: context.wineId }}
                className="underline underline-offset-2"
              >
                {t("common.back")}
              </Link>
            </div>
          )}

          {!messages.length ? (
            <div className="mx-auto mt-8 max-w-sm text-center">
              <MessageCircleMore className="mx-auto h-10 w-10 text-gold" strokeWidth={1.5} />
              <h2 className="mt-4 font-display text-xl text-cream">{t("ask.emptyTitle")}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {t("ask.emptyDesc")}
              </p>
              <div className="mt-5 space-y-2 text-left">
                {[t("ask.prompt.pairing"), t("ask.prompt.explore"), t("ask.prompt.taste")].map(
                  (prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="w-full rounded-md border border-white/10 bg-card/40 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:border-gold/30 hover:bg-card/70"
                    >
                      {prompt}
                    </button>
                  ),
                )}
              </div>
              <p className="mt-5 text-[11px] text-muted-foreground">{t("ask.contextMemory")}</p>
            </div>
          ) : (
            <div className="space-y-4" aria-live="polite">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={cn(
                    "max-w-[88%] rounded-md px-3.5 py-3 text-sm leading-relaxed",
                    message.role === "user"
                      ? "ml-auto bg-burgundy text-cream"
                      : "border border-white/8 bg-card/55 text-foreground",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                </article>
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-gold" /> {t("ask.thinking")}
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div className="sticky bottom-24 -mx-1 bg-background/95 px-1 pb-2 pt-3 backdrop-blur-lg">
          {error && (
            <div
              role="alert"
              className="mb-2 rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </div>
          )}
          <form onSubmit={(event) => void sendMessage(event)} className="flex items-end gap-2">
            <label htmlFor="ask-input" className="sr-only">
              {t("ask.placeholder")}
            </label>
            <textarea
              id="ask-input"
              value={input}
              disabled={busy}
              maxLength={2000}
              rows={2}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder={t("ask.placeholder")}
              className="min-h-12 flex-1 resize-none rounded-md border border-white/12 bg-card/70 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-gold/60 disabled:opacity-60"
            />
            <Button
              type="submit"
              size="icon"
              disabled={busy || !input.trim()}
              aria-label={t("ask.send")}
              className="h-12 w-12 shrink-0 bg-burgundy text-cream hover:bg-burgundy/90"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
          </form>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
            {t("ask.disclaimer")}
          </p>
        </div>
      </div>
    </AppShell>
  );
}
