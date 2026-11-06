import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("owner-controlled deployment", () => {
  it("ships the whole standalone artifact as a non-root Node process", () => {
    const docker = readFileSync("Dockerfile", "utf8");
    expect(docker).toContain("npm ci");
    expect(docker).toContain("npm run build");
    expect(docker).toContain("/app/dist/independent-runtime/ ./");
    expect(docker).toContain("USER node");
    expect(docker).toContain('["node", "server/index.mjs"]');
    expect(docker).not.toMatch(/ARG (?:OPENAI|GEMINI|SUPABASE_SERVICE_ROLE|CRON_SECRET)/);
  });

  it("allowlists Docker inputs and keeps local secret files out of the build context", () => {
    const ignore = readFileSync(".dockerignore", "utf8");
    expect(ignore.split(/\r?\n/)).toContain("**");
    expect(ignore).not.toContain("!config/**");
    expect(ignore).not.toContain("!.env");
    expect(ignore).toContain("!config/independent/environment.ts");
    expect(ignore.split(/\r?\n/)).not.toContain("!supabase/**");
    expect(ignore).toContain("!supabase/functions/_shared/recommendationScoring.ts");
    expect(ignore).toContain("!supabase/functions/_shared/restaurantRanking.ts");
    expect(ignore).not.toContain("!supabase/functions/.env");
  });

  it("does not retain editor session brokers, badges or hardcoded production defaults", () => {
    const client = readFileSync("src/integrations/supabase/client.ts", "utf8");
    expect(client).not.toContain("brokeredPreviewStorage");
    expect(client).toContain("persistSession: true");
    expect(client).toContain("autoRefreshToken: true");
    expect(existsSync("src/integrations/supabase/previewAuthStorage.ts")).toBe(false);
    expect(existsSync("src/components/HostBadgeSpace.tsx")).toBe(false);
    expect(readFileSync("supabase/config.toml", "utf8")).toContain('project_id = "winesnap-local"');
    expect(readFileSync("src/routes/__root.tsx", "utf8")).not.toMatch(/lovable|\.r2\.dev/);
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
    expect(Object.keys(lock.packages).some((path) => path.includes("@lovable"))).toBe(false);
  });
});
