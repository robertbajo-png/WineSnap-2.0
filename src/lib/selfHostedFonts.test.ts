import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import provenance from "../assets/fonts/provenance.json";

describe("self-hosted typography privacy", () => {
  it("retains exact pinned font bytes and distributable licenses", () => {
    expect(provenance.license).toBe("OFL-1.1");
    expect(Object.keys(provenance.files)).toHaveLength(4);
    for (const [file, expected] of Object.entries(provenance.files)) {
      const bytes = readFileSync(new URL(`../assets/fonts/${file}`, import.meta.url));
      expect(bytes.subarray(0, 4).toString()).toBe("wOF2");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(expected);
    }
    for (const source of provenance.packages) {
      expect(source.version).toBe("5.3.0");
      expect(source.tarball).toMatch(/^https:\/\/registry\.npmjs\.org\//);
      expect(source.integrity).toMatch(/^sha512-/);
      const license = readFileSync(source.licenseFile, "utf8");
      expect(license).toContain("SIL OPEN FONT LICENSE Version 1.1");
      expect(license).toContain("Copyright");
    }
  });
  it("uses local Latin/extended faces without runtime font-CDN requests", () => {
    const root = readFileSync(new URL("../routes/__root.tsx", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const css = readFileSync(new URL("../assets/fonts/fonts.css", import.meta.url), "utf8");
    expect(root).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/);
    expect(styles).toContain('@import "./assets/fonts/fonts.css"');
    expect(css.match(/@font-face/g)).toHaveLength(4);
    expect(css).not.toMatch(/https?:|data:/);
    expect(css).toContain('font-family: "Inter"');
    expect(css).toContain('font-family: "Cormorant Garamond"');
    for (const file of Object.keys(provenance.files)) expect(css).toContain(`./${file}`);
  });
});
