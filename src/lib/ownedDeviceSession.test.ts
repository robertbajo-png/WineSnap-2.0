import { describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { createOwnedDeviceSessionHandler, deviceAccessOrigin } from "./ownedDeviceSession.server";

const ownerId = "c5129119-b982-448f-b09a-971afcda0b42";
const session = {
  access_token: "synthetic-access-only",
  refresh_token: "synthetic-refresh-only",
  user: { id: ownerId, role: "authenticated" },
} as Session;
const binding = {
  version: 1 as const,
  project: "winesnap-owned-local" as const,
  hostname: "winesnap.boleoai.se" as const,
  enabled: true,
  ownerId,
};
function setup() {
  const deps = {
    enabled: vi.fn(() => true),
    binding: vi.fn(async () => binding),
    gateState: vi.fn(async () => ({ username: "robert", authentication_level: 1 })),
    openSession: vi.fn(async () => session),
  };
  return { deps, handle: createOwnedDeviceSessionHandler(deps) };
}
const request = (headers: Record<string, string> = {}, body = "{}", origin = deviceAccessOrigin) =>
  new Request(origin + "/api/owned/device-session", {
    method: "POST",
    headers: {
      Origin: deviceAccessOrigin,
      "Content-Type": "application/json",
      "X-WineSnap-Device": "sign-in",
      Cookie: "__Secure-winesnap_gate=synthetic-cookie-only",
      ...headers,
    },
    body,
  });

describe("owned device session exchange", () => {
  it("is absent when the owned backend is not explicitly enabled", async () => {
    const { deps, handle } = setup();
    deps.enabled.mockReturnValue(false);
    expect((await handle(request())).status).toBe(404);
    expect(deps.binding).not.toHaveBeenCalled();
    expect(deps.openSession).not.toHaveBeenCalled();
  });
  it("issues only the configured existing owner's normal session after independent gate verification", async () => {
    const { deps, handle } = setup();
    const response = await handle(request());
    expect(response.status).toBe(200);
    expect(deps.gateState).toHaveBeenCalledExactlyOnceWith(
      "__Secure-winesnap_gate=synthetic-cookie-only",
    );
    expect(deps.openSession).toHaveBeenCalledExactlyOnceWith(ownerId);
    expect(await response.json()).toEqual({ session });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toContain("Cookie");
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
  });
  it.each([
    { Origin: "https://attacker.invalid" },
    { Origin: "" },
    { "X-WineSnap-Device": "" },
    { "Content-Type": "text/plain" },
    { Cookie: "" },
    { Cookie: "__Secure-winesnap_gate=a; __Secure-winesnap_gate=b" },
  ])(
    "rejects missing/foreign intent and ambiguous cookies before opening a session: %j",
    async (headers) => {
      const { deps, handle } = setup();
      expect((await handle(request(headers))).status).toBe(403);
      expect(deps.openSession).not.toHaveBeenCalled();
    },
  );
  it("rejects another host and caller-selected identity", async () => {
    const { deps, handle } = setup();
    expect((await handle(request({}, "{}", "http://127.0.0.1:5212"))).status).toBe(403);
    expect(
      (
        await handle(
          request({}, JSON.stringify({ ownerId: "intruder", email: "other@example.org" })),
        )
      ).status,
    ).toBe(400);
    expect(deps.openSession).not.toHaveBeenCalled();
  });
  it.each(["", "{broken", "null", "[]", "true", " ".repeat(1025) + "{}"])(
    "rejects malformed, non-object and oversized intent before provider calls: %j",
    async (body) => {
      const { deps, handle } = setup();
      expect((await handle(request({}, body))).status).toBe(400);
      expect(deps.gateState).not.toHaveBeenCalled();
      expect(deps.openSession).not.toHaveBeenCalled();
    },
  );
  it.each([
    { username: "intruder", authentication_level: 1 },
    { username: "robert", authentication_level: 0 },
    { username: "robert", authentication_level: 3 },
    { username: "robert", authentication_level: -1 },
  ])("ignores forged identity headers when provider verification denies: %j", async (state) => {
    const { deps, handle } = setup();
    deps.gateState.mockResolvedValue(state);
    expect(
      (await handle(request({ "Remote-User": "robert", Authorization: "Bearer forged" }))).status,
    ).toBe(403);
    expect(deps.openSession).not.toHaveBeenCalled();
  });
  it("does not issue another identity or an administrator/service role", async () => {
    const { deps, handle } = setup();
    deps.openSession.mockResolvedValue({
      ...session,
      user: { ...session.user, id: "another-user" },
    });
    expect((await handle(request())).status).toBe(403);
    deps.openSession.mockResolvedValue({
      ...session,
      user: { ...session.user, role: "service_role" },
    });
    expect((await handle(request())).status).toBe(403);
  });
  it("limits repeated exchanges without retaining raw cookies", async () => {
    const { deps, handle } = setup();
    for (let i = 0; i < 8; i++) expect((await handle(request())).status).toBe(200);
    expect((await handle(request())).status).toBe(429);
    expect(deps.openSession).toHaveBeenCalledTimes(8);
  });
  it("fails closed and hides internal/provider error details", async () => {
    const { deps, handle } = setup();
    deps.gateState.mockRejectedValue(new Error("secret-canary-never-return"));
    const response = await handle(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret-canary");
    expect(deps.openSession).not.toHaveBeenCalled();
  });
});
