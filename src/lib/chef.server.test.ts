import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createChefHandler } from "./chef.server";
import { emptyChefContext, safetyAnswer } from "@/features/chef/domain";

const owner = "00000000-0000-4000-8000-000000000001";
const input = () => ({
  action: "chat",
  requestId: crypto.randomUUID(),
  context: emptyChefContext,
  message: "Hur skär jag en tomat?",
  conversationId: crypto.randomUUID(),
  conversationRevision: 0,
});
function setup(
  options: {
    enabled?: boolean;
    active?: boolean;
    cached?: unknown;
    quota?: boolean;
    content?: string;
    finish?: string;
    providerStatus?: number;
    authorizeStatus?: boolean;
    rows?: Record<string, Record<string, unknown>[]>;
  } = {},
) {
  const writes: { name: string; args: Record<string, unknown> }[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    writes.push({ name, args });
    if (name === "chef_user_active") return { data: options.active ?? true, error: null };
    if (name === "chef_claim_request")
      return {
        data: options.cached ? { cached: options.cached } : { memoryRevision: 0 },
        error: options.quota ? { message: "chef_quota" } : null,
      };
    if (name === "chef_finish_request") return { data: args.result, error: null };
    return { data: null, error: null };
  });
  const filters: unknown[][] = [];
  const from = vi.fn((table: string) => {
    const query = {
      select: () => query,
      eq: (...args: unknown[]) => {
        filters.push([table, ...args]);
        return query;
      },
      order: () => query,
      limit: async () => ({ data: options.rows?.[table] ?? [], error: null }),
      maybeSingle: async () => ({ data: options.rows?.[table]?.[0] ?? null, error: null }),
      single: async () => ({ data: options.rows?.[table]?.[0] ?? null, error: null }),
    };
    return query;
  });
  const complete = vi.fn(async (_body: Record<string, unknown>) => ({
    model: "gemini-synthetic",
    response: options.providerStatus
      ? new Response("private provider error", { status: options.providerStatus })
      : Response.json({
          choices: [
            {
              finish_reason: options.finish ?? "stop",
              message: { content: options.content ?? "**Tomat:** Skär försiktigt." },
            },
          ],
          usage: { prompt_tokens: 50, completion_tokens: 15 },
        }),
  }));
  const authorize = vi.fn(async () => {
    if (options.authorizeStatus) throw new Error("private auth error");
    return { owner, admin: { rpc, from } as unknown as SupabaseClient };
  });
  const handler = createChefHandler({
    enabled: () => options.enabled ?? true,
    authorize,
    complete,
  });
  const call = (data: unknown = input(), init: RequestInit = {}) =>
    handler(
      new Request("http://127.0.0.1/api/chef", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-token" },
        body: JSON.stringify(data),
        ...init,
      }),
    );
  return { call, complete, authorize, writes, filters };
}
describe("test-only Chef security boundary", () => {
  it("rejects disabled, unauthenticated and unexpected fields before provider access", async () => {
    const disabled = setup({ enabled: false });
    expect((await disabled.call()).status).toBe(503);
    expect(disabled.authorize).not.toHaveBeenCalled();
    const test = setup();
    expect(
      (await test.call(input(), { headers: { "Content-Type": "application/json" } })).status,
    ).toBe(401);
    expect((await test.call({ ...input(), userId: owner, model: "redirect" })).status).toBe(400);
    expect(test.complete).not.toHaveBeenCalled();
  });
  it("rejects oversized JSON even without Content-Length", async () => {
    const test = setup();
    expect((await test.call({ text: "a".repeat(33000) })).status).toBe(413);
    expect(test.authorize).not.toHaveBeenCalled();
  });
  it("blocks erased/disabled accounts before context or provider reads", async () => {
    const test = setup({ active: false });
    expect((await test.call()).status).toBe(403);
    expect(test.complete).not.toHaveBeenCalled();
    expect(test.filters).toHaveLength(0);
  });
  it("checks foreign context against the authenticated owner, not caller IDs", async () => {
    const test = setup();
    const data = input();
    data.context = { ...emptyChefContext, recipeVersionId: crypto.randomUUID() };
    expect((await test.call(data)).status).toBe(404);
    expect(test.filters).toContainEqual(["kitchen_recipe_versions", "user_id", owner]);
    expect(test.complete).not.toHaveBeenCalled();
  });
  it("returns cached retries before stale conversation/context checks", async () => {
    const cached = { answer: "saved", model: "synthetic" };
    const test = setup({ cached });
    const data = {
      ...input(),
      conversationRevision: 9,
      context: { ...emptyChefContext, recipeVersionId: crypto.randomUUID() },
    };
    expect(await (await test.call(data)).json()).toEqual(cached);
    expect(test.complete).not.toHaveBeenCalled();
    expect(test.filters).toHaveLength(0);
  });
  it("returns 429 before invoking Gemini when atomic reservation fails", async () => {
    const test = setup({ quota: true });
    const response = await test.call();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("300");
    expect(test.complete).not.toHaveBeenCalled();
  });
  it("handles safety questions without provider access or medical prompt storage", async () => {
    const test = setup();
    const response = await test.call({
      ...input(),
      message: "Jag har diabetes, är rå kyckling säkert?",
    });
    expect(response.status).toBe(200);
    expect((await response.json()).safety).toBe(true);
    expect(test.complete).not.toHaveBeenCalled();
    expect(test.writes.find((w) => w.name === "chef_finish_request")?.args.prompt).not.toMatch(
      /diabetes|kyckling/,
    );
  });
  it("does not forward accidentally pasted keys", async () => {
    const test = setup();
    expect((await test.call({ ...input(), message: "sk-proj-" + "a".repeat(40) })).status).toBe(
      400,
    );
    expect(test.complete).not.toHaveBeenCalled();
  });
  it.each(["title", "description", "ingredient", "step"])(
    "blocks credentials in server-loaded recipe %s before provider access",
    async (field) => {
      const secret = "sk-proj-" + "synthetic".repeat(5);
      const version = {
        id: crypto.randomUUID(),
        recipe_id: crypto.randomUUID(),
        user_id: owner,
        revision: 1,
        created_at: new Date().toISOString(),
        document: {
          title: field === "title" ? secret : "Tomat",
          description: field === "description" ? secret : "",
          servings: 2,
          totalMinutes: 10,
          image: "none",
          sourceNote: "",
          notes: "private notes are not provider context",
          ingredients: [
            {
              id: crypto.randomUUID(),
              name: field === "ingredient" ? secret : "Tomat",
              amount: 1,
              unit: "pcs",
            },
          ],
          steps: [
            {
              id: crypto.randomUUID(),
              title: "Skär",
              text: field === "step" ? secret : "Skär tomaten.",
              timerSeconds: null,
            },
          ],
        },
      };
      const test = setup({ rows: { kitchen_recipe_versions: [version] } });
      const response = await test.call({
        ...input(),
        context: { ...emptyChefContext, recipeVersionId: version.id },
      });
      expect(response.status).toBe(400);
      expect(await response.text()).not.toContain(secret);
      expect(test.complete).not.toHaveBeenCalled();
      expect(test.writes.some((w) => w.name === "chef_fail_request")).toBe(true);
      expect(test.writes.some((w) => w.name === "chef_finish_request")).toBe(false);
    },
  );
  it.each([
    { text: "AIza" + "synthetic".repeat(5), status: 400 },
    { text: "Jag har diabetes", status: 422 },
  ])("does not forward unsafe earlier conversation data: $status", async ({ text, status }) => {
    const data = { ...input(), conversationRevision: 1 };
    const test = setup({
      rows: {
        chef_conversations: [{ id: data.conversationId, user_id: owner, revision: 1 }],
        chef_messages: [{ role: "user", content: text, turn: 1 }],
      },
    });
    const response = await test.call(data);
    expect(response.status).toBe(status);
    expect(test.complete).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain(text);
    expect(test.writes.some((w) => w.name === "chef_finish_request")).toBe(false);
  });
  it("does not forward credentials from selected feedback", async () => {
    const test = setup({
      rows: {
        cooking_feedback: [
          {
            id: crypto.randomUUID(),
            note: "sb_secret_" + "synthetic".repeat(5),
            created_at: "2026-10-25T10:00:00Z",
          },
        ],
        food_memory_state: [{ reset_at: "2026-10-24T10:00:00Z" }],
      },
    });
    expect(
      (
        await test.call({
          action: "extract",
          requestId: crypto.randomUUID(),
          context: emptyChefContext,
          feedbackId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(400);
    expect(test.complete).not.toHaveBeenCalled();
  });
  it("does not mistake the built-in safety refusal for a user's medical history", async () => {
    const data = { ...input(), conversationRevision: 1 };
    const test = setup({
      rows: {
        chef_conversations: [{ id: data.conversationId, user_id: owner, revision: 1 }],
        chef_messages: [
          {
            role: "user",
            content: "Fråga om livsmedelssäkerhet (frågetexten sparas inte).",
            turn: 1,
          },
          { role: "assistant", content: safetyAnswer, turn: 1 },
        ],
      },
    });
    expect((await test.call(data)).status).toBe(200);
    expect(test.complete).toHaveBeenCalledOnce();
  });
  it("detects credential-shaped confirmed memory after case normalization", async () => {
    const test = setup({
      rows: {
        food_signals: [
          {
            id: crypto.randomUUID(),
            user_id: owner,
            source_kind: "statement",
            source_key: "synthetic",
            source_feedback_id: null,
            attribute: "ingredient",
            value: "AIza" + "synthetic".repeat(5),
            direction: 1,
            source_excerpt: "",
            source_title: "",
            confidence: 1,
            status: "confirmed",
            revision: 1,
            created_at: new Date().toISOString(),
          },
        ],
      },
    });
    expect((await test.call()).status).toBe(400);
    expect(test.complete).not.toHaveBeenCalled();
  });
  it.each(["ghp_" + "synthetic".repeat(5), "-----BEGIN PRIVATE KEY-----"])(
    "does not persist or display a credential-shaped provider answer",
    async (content) => {
      const test = setup({ content });
      const response = await test.call();
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain(content);
      expect(test.writes.some((w) => w.name === "chef_finish_request")).toBe(false);
      expect(test.writes.some((w) => w.name === "chef_fail_request")).toBe(true);
    },
  );
  it("does not re-expose a credential-shaped cached result", async () => {
    const test = setup({ cached: { answer: "sk-proj-" + "synthetic".repeat(5) } });
    expect((await test.call()).status).toBe(502);
    expect(test.complete).not.toHaveBeenCalled();
  });
  it("checks structured drafts after JSON escape decoding too", async () => {
    const secret = "sk-proj-" + "synthetic".repeat(5);
    const content = JSON.stringify({
      title: "Tomatsoppa",
      description: secret,
      servings: 2,
      totalMinutes: 10,
      ingredients: [{ name: "Tomat", amount: 2, unit: "pcs" }],
      steps: [{ title: "Skär", text: "Skär tomaten.", timerSeconds: null }],
    }).replace("sk-proj-", "\\u0073k-proj-");
    const test = setup({ content });
    const response = await test.call({
      action: "generate",
      requestId: crypto.randomUUID(),
      context: emptyChefContext,
      prompt: "Tomatsoppa",
      servings: 2,
      maxMinutes: 20,
    });
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(secret);
    expect(test.writes.some((w) => w.name === "chef_finish_request")).toBe(false);
  });
  it("uses bounded tokens, no tools, no recipe/session writes and no owner IDs in prompts", async () => {
    const test = setup();
    expect((await test.call()).status).toBe(200);
    const payload = test.complete.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.max_tokens).toBe(1536);
    expect(payload).not.toHaveProperty("tools");
    expect(JSON.stringify(payload)).not.toContain(owner);
    expect(test.writes.map((w) => w.name)).toEqual([
      "chef_user_active",
      "chef_claim_request",
      "chef_finish_request",
    ]);
  });
  it.each([{ finish: "length" }, { content: "" }, { providerStatus: 503 }])(
    "never commits a partial/provider error answer: %o",
    async (config) => {
      const test = setup(config);
      const response = await test.call();
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain("private provider");
      expect(test.writes.some((w) => w.name === "chef_finish_request")).toBe(false);
      expect(test.writes.some((w) => w.name === "chef_fail_request")).toBe(true);
    },
  );
  it("rejects malformed structured recipe without creating a recipe", async () => {
    const test = setup({ content: '{"title":"Incomplete","tools":["save"]}' });
    expect(
      (
        await test.call({
          action: "generate",
          requestId: crypto.randomUUID(),
          context: emptyChefContext,
          prompt: "Soppa",
          servings: 2,
          maxMinutes: 20,
        })
      ).status,
    ).toBe(502);
    expect(test.writes.some((w) => w.name === "chef_finish_request")).toBe(false);
  });
});
