import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Chef prototype source boundaries", () => {
  it("keeps the production entry and styles separate", () => {
    expect(read("src/routes/__root.tsx")).not.toContain("chef-prototype");
    expect(read("src/styles.css")).not.toContain("chef-prototype");
    expect(read("prototypes/chef/index.html")).toContain('content="noindex, nofollow"');
  });

  it("builds the prototype without importing Lovable's config", () => {
    const config = read("prototypes/chef/vite.config.ts");
    expect(config).toContain("@vitejs/plugin-react");
    expect(config).not.toContain("@lovable");
    expect(config).toContain("dist/chef-prototype");
  });

  it("does not use production clients, model calls or durable browser storage", () => {
    for (const file of ["main.tsx", "ChefPrototype.tsx", "domain.ts", "data.ts"]) {
      const source = read(`src/features/chef-prototype/${file}`);
      expect(source).not.toMatch(
        /\b(fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB)\b/,
      );
      expect(source).not.toContain("integrations/supabase");
      expect(source).not.toContain("functions.invoke");
    }
  });
});
