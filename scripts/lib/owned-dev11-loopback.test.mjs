import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { openDev11Loopback } from "./owned-dev11-loopback.mjs";

const pageOrigin = "http://127.0.0.1:5291";
const proof = "a".repeat(64);
const path = "/api/dev11/journal";
const origin = (server) => "http://127.0.0.1:" + server.address().port;
async function close(server) {
  if (!server) return;
  const done = once(server, "close");
  server.close();
  server.closeAllConnections();
  await done;
}

describe("private journal loopback boundary", () => {
  it("limits origin, path, method and forwarded headers even for authenticated callers", async () => {
    const seen = [];
    const upstream = createServer((request, response) => {
      seen.push({
        path: request.url,
        protectedHeader: request.headers["x-winesnap-dev11-proof"] === proof,
        cookieStripped: !request.headers.cookie,
      });
      response.setHeader("Set-Cookie", "ignored-fixture-cookie=1");
      response.end("{}");
    });
    upstream.listen(0, "127.0.0.1");
    await once(upstream, "listening");
    let bridge;
    try {
      bridge = await openDev11Loopback({ proof, upstream: origin(upstream), pageOrigin, port: 0 });
      const address = origin(bridge);
      const common = {
        "Content-Type": "application/json",
        Authorization: "Bearer " + "x".repeat(24),
      };
      const wrongOrigin = await fetch(address + path, {
        method: "POST",
        headers: { ...common, Origin: "https://example.invalid" },
        body: "{}",
      });
      expect(wrongOrigin.status).toBe(404);
      expect(wrongOrigin.headers.has("access-control-allow-origin")).toBe(false);
      expect(
        (await fetch(address + path + "?unapproved", { headers: { Origin: pageOrigin } })).status,
      ).toBe(404);
      expect((await fetch(address + path, { headers: { Origin: pageOrigin } })).status).toBe(405);
      const preflight = await fetch(address + path, {
        method: "OPTIONS",
        headers: {
          Origin: pageOrigin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization,content-type",
        },
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-origin")).toBe(pageOrigin);
      expect(seen).toEqual([]);
      const good = await fetch(address + path, {
        method: "POST",
        headers: {
          ...common,
          Origin: pageOrigin,
          Cookie: "irrelevant=1",
          "X-WineSnap-Dev11-Proof": "spoofed",
        },
        body: "{}",
      });
      expect(good.status).toBe(200);
      expect(good.headers.has("set-cookie")).toBe(false);
      expect(good.headers.get("cache-control")).toContain("no-store");
      expect(seen).toEqual([{ path, protectedHeader: true, cookieStripped: true }]);
    } finally {
      await close(bridge);
      await close(upstream);
    }
  });

  it.each(["internet.conf", "gated-internet.conf"])(
    "also denies and strips at %s",
    async (name) => {
      const config = await readFile(
        new URL("../../config/owned-windows/" + name, import.meta.url),
        "utf8",
      );
      expect(config).toMatch(/location\s+\^~\s+\/api\/dev11\s+\{\s*return 404;/);
      expect(config).toMatch(/proxy_set_header X-WineSnap-Dev11-Proof "";/);
    },
  );
});
