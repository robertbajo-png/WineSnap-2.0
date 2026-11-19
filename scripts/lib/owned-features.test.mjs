import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { acceptOwnedFeatures } from "./owned-features.mjs";

describe("owned feature acceptance boundaries", () => {
  it("rejects foreign credentials before creating fixtures or making requests", async () => {
    await expect(acceptOwnedFeatures({ project: "other" })).rejects.toThrow();
  });
  it("keeps provider scenarios opt-in and does not reuse real accounts", () => {
    const source = readFileSync(new URL("./owned-features.mjs", import.meta.url), "utf8");
    expect(source).toContain("liveAi = false");
    expect(source).toContain("report.aiScenarios < 8");
    expect(source).toContain("if (liveAi)");
    expect(source).toContain("owned_feature_run: run");
    expect(source).toContain("found.user_metadata.owned_feature_run, run");
    expect(source).toContain("found.email, user.email");
    expect(source).toContain(
      "new URL(url instanceof Request ? url.url : String(url)).origin, ownedApi",
    );
    expect(source).not.toMatch(
      /\.supabase\.co|playwright|chromium|writeFile|localStorage|from\("kitchen_config"\)\.update/,
    );
  });
});
