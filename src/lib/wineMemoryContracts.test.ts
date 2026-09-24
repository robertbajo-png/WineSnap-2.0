import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const migration = read("supabase/migrations/20260924090000_add_wine_memory_foundation.sql");

describe("Wine Memory contracts", () => {
  it("keeps evidence separate from derived preferences", () => {
    expect(migration).toContain("CREATE TABLE public.taste_signals");
    expect(migration).toContain("CREATE TABLE public.derived_preferences");
    expect(migration).toContain("evidence_count integer NOT NULL");
    expect(migration).toContain("confidence numeric(4,3) NOT NULL");
  });

  it("protects client writes and exposes only owner reads", () => {
    expect(migration).toContain("GRANT SELECT ON public.taste_signals TO authenticated");
    expect(migration).toContain("GRANT SELECT ON public.derived_preferences TO authenticated");
    expect(migration).toContain('CREATE POLICY "Users read own taste signals"');
    expect(migration).toContain('CREATE POLICY "Users read own derived preferences"');
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.replace_extracted_preference_signals",
    );
  });

  it("routes free-text extraction through the authenticated shared AI guard", () => {
    const source = read("supabase/functions/extract-preference-signals/index.ts");
    expect(source).toContain('from "../_shared/aiSecurity.ts"');
    expect(source).toContain("requireAiAccess(req");
    expect(source).toContain('functionName: "extract-preference-signals"');
    expect(source).toContain('admin.rpc("replace_extracted_preference_signals"');
  });
});
