import { describe, expect, it, vi } from "vitest";
import { createWineImageHandler, readWineImage } from "../../supabase/functions/wine-image/handler";

const owner = "33333333-3333-4333-8333-333333333333";
const path = `${owner}/label.png`;
function setup() {
  const deps = {
    authenticate: vi.fn().mockResolvedValue({ id: owner }),
    active: vi.fn().mockResolvedValue(true),
    shared: vi.fn().mockResolvedValue(false),
    download: vi.fn().mockResolvedValue(new Blob(["synthetic"], { type: "image/png" })),
  };
  const handler = createWineImageHandler(deps);
  const call = (
    body: unknown = { path },
    token: string | null = "Bearer synthetic-token",
    method = "POST",
  ) =>
    handler(
      new Request("https://staging.example.invalid/functions/v1/wine-image", {
        method,
        headers: token === null ? {} : { Authorization: token },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      }),
    );
  return { deps, handler, call };
}

describe("revocable image handler", () => {
  it("checks the active owner on every request and returns only non-cacheable image bytes", async () => {
    const { call, deps } = setup();
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("synthetic");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("surrogate-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(deps.active).toHaveBeenCalledTimes(2);
    expect(deps.shared).not.toHaveBeenCalled();
    deps.active.mockResolvedValue(false);
    expect((await call()).status).toBe(404);
    expect(deps.download).toHaveBeenCalledTimes(1);
  });

  it("allows an anonymous shared image but not the next request after unsharing", async () => {
    const { call, deps } = setup();
    deps.shared.mockResolvedValue(true);
    expect((await call({ path }, null)).status).toBe(200);
    deps.shared.mockResolvedValue(false);
    expect((await call({ path }, null)).status).toBe(404);
    expect(deps.authenticate).not.toHaveBeenCalled();
    expect(deps.download).toHaveBeenCalledTimes(1);
  });

  it("does not trust a body-supplied owner or allow a stranger's private image", async () => {
    const { call, deps } = setup();
    deps.authenticate.mockResolvedValue({ id: "stranger" });
    expect((await call({ path, userId: owner })).status).toBe(404);
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("does not downgrade invalid credentials to anonymous public access", async () => {
    const { call, deps } = setup();
    deps.shared.mockResolvedValue(true);
    expect((await call({ path }, "Basic invalid")).status).toBe(401);
    deps.authenticate.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(deps.shared).not.toHaveBeenCalled();
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("rechecks erasure and sharing changes during a download", async () => {
    const { call, deps } = setup();
    deps.active.mockResolvedValueOnce(true).mockResolvedValue(false);
    expect((await call()).status).toBe(404);
    deps.shared.mockResolvedValueOnce(true).mockResolvedValue(false);
    expect((await call({ path }, null)).status).toBe(404);
  });

  it.each([
    "file.png",
    "../file.png",
    "/owner/file.png",
    "owner//file.png",
    "owner/../file.png",
    "owner/%2e%2e/file.png",
    "https://other.invalid/image",
    "owner/file.png?token=x",
    "owner\\file.png",
    "owner/\u0000.png",
    "a/" + "x".repeat(1024),
  ])("rejects unsafe path %s before accessing data", async (unsafePath) => {
    const { call, deps } = setup();
    expect((await call({ path: unsafePath })).status).toBe(400);
    expect(deps.download).not.toHaveBeenCalled();
    expect(deps.authenticate).not.toHaveBeenCalled();
  });

  it("bounds the request body and rejects malformed JSON", async () => {
    const { call, handler } = setup();
    expect((await call({ path, padding: "x".repeat(4096) })).status).toBe(413);
    expect(
      (await handler(new Request("https://example.invalid", { method: "POST", body: "{" }))).status,
    ).toBe(400);
  });

  it("fails closed on permission or download outages without leaking error contents", async () => {
    const { call, deps } = setup();
    deps.active.mockRejectedValue(new Error("private-diagnostic-canary"));
    const response = await call();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-diagnostic-canary");
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("rejects executable content and oversized images", async () => {
    const { call, deps } = setup();
    deps.download.mockResolvedValue(new Blob(["<svg/>"], { type: "image/svg+xml" }));
    expect((await call()).status).toBe(502);
    deps.download.mockResolvedValue(
      new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "image/png" }),
    );
    expect((await call()).status).toBe(502);
  });

  it("handles preflight without accessing data and disallows GET/HEAD", async () => {
    const { call, deps } = setup();
    expect((await call({}, null, "OPTIONS")).status).toBe(204);
    expect((await call({}, null, "GET")).status).toBe(405);
    expect((await call({}, null, "HEAD")).status).toBe(405);
    expect(deps.download).not.toHaveBeenCalled();
  });
});

describe("bounded upstream image reader", () => {
  it("only accepts safe image response types and present bytes", async () => {
    const image = await readWineImage(
      new Response("synthetic", { headers: { "Content-Type": "image/png" } }),
    );
    expect(image?.type).toBe("image/png");
    await expect(
      readWineImage(new Response("<script/>", { headers: { "Content-Type": "text/html" } })),
    ).rejects.toThrow();
    await expect(
      readWineImage(new Response("", { headers: { "Content-Type": "image/png" } })),
    ).rejects.toThrow();
    expect(await readWineImage(new Response("not found", { status: 404 }))).toBeNull();
    await expect(
      readWineImage(new Response("upstream failure", { status: 500 })),
    ).rejects.toThrow();
  });

  it("bounds declared and undeclared image sizes", async () => {
    await expect(
      readWineImage(
        new Response("x", {
          headers: { "Content-Type": "image/png", "Content-Length": String(10 * 1024 * 1024 + 1) },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      readWineImage(
        new Response(new Uint8Array(10 * 1024 * 1024 + 1), {
          headers: { "Content-Type": "image/png" },
        }),
      ),
    ).rejects.toThrow();
  });
});
