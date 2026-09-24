export type AskWineSnapContext = {
  source?: "ask" | "wine" | "recommendation" | "cellar";
  wineId?: string;
  route?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sanitizeAskContext(context: AskWineSnapContext): AskWineSnapContext {
  const source = ["ask", "wine", "recommendation", "cellar"].includes(context.source ?? "")
    ? context.source
    : "ask";
  const route = context.route?.startsWith("/") ? context.route.slice(0, 160) : "/ask";
  const wineId = context.wineId && UUID_PATTERN.test(context.wineId) ? context.wineId : undefined;
  return { source, route, ...(wineId ? { wineId } : {}) };
}

export function createConversationTitle(message: string) {
  const compact = message.replace(/\s+/g, " ").trim();
  if (compact.length <= 60) return compact;
  return `${compact.slice(0, 57).trimEnd()}...`;
}

export function validateAskMessage(message: string) {
  const value = message.trim();
  if (!value) return { valid: false as const, error: "empty" as const };
  if (value.length > 2000) return { valid: false as const, error: "too_long" as const };
  return { valid: true as const, value };
}
