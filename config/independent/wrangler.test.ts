import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("deployment configuration", () => {
  it("keeps the Wrangler configuration in the strict JSON subset parsed by Nitro", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8"),
    );
    expect(config.main).toBe("@tanstack/react-start/server-entry");
    expect(config.compatibility_flags).toContain("nodejs_compat");
  });
});
