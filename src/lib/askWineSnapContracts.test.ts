import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Ask WineSnap backend contracts", () => {
  const migration = read("supabase/migrations/20260925090000_add_ask_winesnap.sql");
  const source = read("supabase/functions/ask-winesnap/index.ts");

  it("stores private conversations and server-authored messages", () => {
    expect(migration).toContain("CREATE TABLE public.ai_conversations");
    expect(migration).toContain("CREATE TABLE public.ai_messages");
    expect(migration).toContain("GRANT SELECT ON public.ai_messages TO authenticated");
    expect(migration).toContain('CREATE POLICY "Users read own AI messages"');
    expect(migration).not.toContain("GRANT INSERT ON public.ai_messages TO authenticated");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.store_ai_exchange");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.store_ai_exchange");
  });

  it("uses the shared authenticated quota guard", () => {
    expect(source).toContain('from "../_shared/aiSecurity.ts"');
    expect(source).toContain("requireAiAccess(req");
    expect(source).toContain('functionName: "ask-winesnap"');
  });

  it("retrieves memory and validates current-wine ownership", () => {
    expect(source).toContain('from("derived_preferences")');
    expect(source).toContain('from("taste_profile")');
    expect(source).toContain("wine.user_id === access.userId || wine.is_public");
    expect(source).toContain('admin.rpc("store_ai_exchange"');
  });
});
