import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const doubles = vi.hoisted(() => ({
  enabled: vi.fn(),
  keys: vi.fn(),
  admin: vi.fn(),
  erase: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("./localCredentials.server", () => ({
  localOperationsEnabled: doubles.enabled,
  operationsCredentials: doubles.keys,
  getOperationsAdmin: doubles.admin,
}));
vi.mock("../../supabase/functions/_shared/privacyErasure", () => ({
  runAccountErasure: doubles.erase,
}));
import { handleLocalPrivacy } from "./localPrivacy.server";
const names = ["privacy-controls", "privacy-export", "privacy-maintenance"] as const;
const request = (body: unknown = {}, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/privacy/privacy-controls", {
    method: "POST",
    headers: {
      authorization: "Bearer synthetic-token",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  doubles.enabled.mockReturnValue(true);
  doubles.keys.mockResolvedValue({ privacyCronSecret: "synthetic-cron-secret-".repeat(3) });
  doubles.getUser.mockResolvedValue({ data: { user: null }, error: null });
  doubles.admin.mockResolvedValue({ auth: { getUser: doubles.getUser } });
});
afterEach(() => vi.unstubAllGlobals());
describe("test-only local privacy boundary", () => {
  it.each(names)("keeps %s closed outside the approved local runtime", async (name) => {
    doubles.enabled.mockReturnValue(false);
    expect((await handleLocalPrivacy(request(), name)).status).toBe(503);
    expect(doubles.keys).not.toHaveBeenCalled();
  });
  it.each(names)("rejects missing auth on %s before reading secrets", async (name) => {
    const response = await handleLocalPrivacy(request({}, { authorization: "" }), name);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(doubles.keys).not.toHaveBeenCalled();
  });
  it.each([
    [
      "privacy-controls",
      { action: "delete_account", confirm: "delete_account", userId: "stranger" },
    ],
    ["privacy-controls", { action: "other", confirm: "other" }],
    ["privacy-export", { userId: "stranger" }],
    ["privacy-maintenance", { execute: true, secret: "caller-selected-secret" }],
  ] as const)("rejects unsupported %s bodies before secrets or mutations", async (name, body) => {
    expect((await handleLocalPrivacy(request(body), name)).status).toBe(400);
    expect(doubles.keys).not.toHaveBeenCalled();
    expect(doubles.erase).not.toHaveBeenCalled();
  });
  it("enforces its streamed byte cap even without content-length", async () => {
    expect(
      (await handleLocalPrivacy(request({ text: "x".repeat(4100) }), "privacy-export")).status,
    ).toBe(400);
    expect(doubles.keys).not.toHaveBeenCalled();
  });
  it("treats malformed JSON as input error, not an unavailable backend", async () => {
    const response = await handleLocalPrivacy(
      new Request("http://localhost/api/privacy/privacy-export", {
        method: "POST",
        headers: { authorization: "Bearer synthetic", "content-type": "application/json" },
        body: "{",
      }),
      "privacy-export",
    );
    expect(response.status).toBe(400);
    expect(doubles.keys).not.toHaveBeenCalled();
  });
  it("verifies a user token and strips Edge CORS headers from denied requests", async () => {
    const response = await handleLocalPrivacy(request(), "privacy-export");
    expect(response.status).toBe(401);
    expect(doubles.getUser).toHaveBeenCalledWith("synthetic-token");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
  });
  it("never accepts a user JWT as a maintenance secret", async () => {
    expect(
      (await handleLocalPrivacy(request({ execute: true }), "privacy-maintenance")).status,
    ).toBe(401);
    expect(doubles.getUser).not.toHaveBeenCalled();
    expect(doubles.erase).not.toHaveBeenCalled();
  });
  it("fails closed without disclosing credential-store failures", async () => {
    doubles.keys.mockRejectedValue(new Error("private-secret-value"));
    const response = await handleLocalPrivacy(request(), "privacy-export");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-secret-value");
  });
});
