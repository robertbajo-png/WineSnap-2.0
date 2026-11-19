import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const origin = "https://winesnap.boleoai.se";
let entries: Map<string, string>;
let request: ReturnType<typeof vi.fn>;
let location: { origin: string; href: string; assign: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.resetModules();
  entries = new Map();
  vi.stubEnv("VITE_OWNED_BACKEND_ENABLED", "true");
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  });
  location = { origin, href: origin + "/", assign: vi.fn() };
  vi.stubGlobal("window", { location, history: { state: {}, replaceState: vi.fn() } });
  request = vi.fn(async () =>
    Response.json({ session: { access_token: "synthetic", user: { id: "synthetic-owner" } } }),
  );
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("password-free owned browser handoff", () => {
  it("makes only one same-origin protected exchange for concurrent consumers", async () => {
    const api = await import("./ownedDeviceLogin");
    const results = await Promise.all([
      api.requestOwnedDeviceSession(),
      api.requestOwnedDeviceSession(),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "/api/owned/device-session",
      expect.objectContaining({
        method: "POST",
        body: "{}",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
      }),
    );
  });
  it("does nothing on hosted production, another host or the local test browser", async () => {
    const api = await import("./ownedDeviceLogin");
    for (const value of [
      "https://wine-scene-snap.lovable.app",
      "http://127.0.0.1:5212",
      "https://attacker.invalid",
    ]) {
      location.origin = value;
      expect(await api.requestOwnedDeviceSession()).toBeNull();
    }
    location.origin = origin;
    vi.stubEnv("VITE_OWNED_BACKEND_ENABLED", "false");
    expect(await api.requestOwnedDeviceSession()).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
  it("does not undo an explicit logout, even when a handoff is already in flight", async () => {
    let finish!: (value: Response) => void;
    request.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const api = await import("./ownedDeviceLogin");
    const waiting = api.requestOwnedDeviceSession();
    api.markOwnedDeviceSignedOut();
    finish(Response.json({ session: { user: { id: "must-not-return" } } }));
    expect(await waiting).toBeNull();
    expect(await api.requestOwnedDeviceSession()).toBeNull();
  });
  it("does not follow login redirects or retry a failed exchange automatically", async () => {
    request.mockResolvedValue(new Response(null, { status: 403 }));
    const api = await import("./ownedDeviceLogin");
    expect(await api.requestOwnedDeviceSession()).toBeNull();
    expect(await api.requestOwnedDeviceSession()).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("ends only this browser's outer session using the normal provider logout endpoint", async () => {
    request.mockResolvedValue(Response.json({ status: "OK" }));
    const api = await import("./ownedDeviceLogin");
    await api.leaveOwnedDeviceGate();
    expect(request).toHaveBeenCalledWith(
      "/gate/api/logout",
      expect.objectContaining({ method: "POST", credentials: "same-origin", redirect: "error" }),
    );
    expect(window.location.assign).toHaveBeenCalledWith(expect.stringMatching(/^\/gate\/\?rd=/));
  });
});
