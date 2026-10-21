import { describe, expect, it } from "vitest";
import {
  escapeImageTestHtml,
  imageBrowserEnvironment,
  imageControlRequestAllowed,
  imageTestOrigin,
} from "./image-browser-session.mjs";

describe("hosted image browser session boundaries", () => {
  it("pins the actual app to the approved test with the image proxy enabled", () => {
    const env = imageBrowserEnvironment({}, "sb_publishable_synthetic");
    expect(env.VITE_SUPABASE_URL).toBe(imageTestOrigin);
    expect(env.VITE_WINE_IMAGE_PROXY_ENABLED).toBe("true");
    expect(env.VITE_PRIVACY_CONTROLS_ENABLED).toBe("false");
  });
  it("never passes admin credentials or inherited production settings to Vite", () => {
    const env = imageBrowserEnvironment(
      {
        PATH: "synthetic-path",
        SUPABASE_SERVICE_ROLE_KEY: "private-canary",
        WINESNAP_TEST_SECRET_KEY: "private-canary",
        VITE_SUPABASE_URL: "https://production.invalid",
        VITE_OTHER_SECRET: "private-canary",
        NODE_OPTIONS: "--import private-canary",
      },
      "sb_publishable_synthetic",
    );
    expect(JSON.stringify(env)).not.toContain("private-canary");
    expect(JSON.stringify(env)).not.toContain("production.invalid");
    expect(env.PATH).toBe("synthetic-path");
  });
  it("rejects a secret or missing key in the public environment", () => {
    for (const key of [undefined, "", "sb_secret_synthetic", "eyJ.synthetic"]) {
      expect(() => imageBrowserEnvironment({}, key)).toThrow();
    }
  });
  it("requires the exact loopback host, origin, cookie and form nonce for mutations", () => {
    const origin = "http://127.0.0.1:5203";
    const request = {
      headers: {
        host: "127.0.0.1:5203",
        origin,
        cookie: "winesnap_image_test=synthetic-nonce",
      },
    };
    expect(imageControlRequestAllowed(request, origin, "synthetic-nonce", "synthetic-nonce")).toBe(
      true,
    );
    for (const headers of [
      { ...request.headers, host: "rebound.invalid:5203" },
      { ...request.headers, origin: "http://attacker.invalid" },
      { ...request.headers, origin: undefined },
      { ...request.headers, cookie: undefined },
      { ...request.headers, cookie: "winesnap_image_test=wrong" },
    ]) {
      expect(
        imageControlRequestAllowed({ headers }, origin, "synthetic-nonce", "synthetic-nonce"),
      ).toBeFalsy();
    }
    expect(imageControlRequestAllowed(request, origin, "synthetic-nonce", "wrong")).toBe(false);
  });
  it("escapes fixture text and existing synthetic credentials in the local HTML", () => {
    expect(escapeImageTestHtml('<script a="b">&\'</script>')).toBe(
      "&lt;script a=&quot;b&quot;&gt;&amp;&#39;&lt;/script&gt;",
    );
  });
});
