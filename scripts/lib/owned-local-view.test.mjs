import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createOwnedLocalLogin, ownedLocalViewRequest } from "./owned-local-view.mjs";

const email = "owner@example.org";
const id = "01234567-89ab-4cde-8123-456789abcdef";
const installationId = "1".repeat(32);
const binding = () => ({
  version: 1,
  project: "winesnap-owned-local",
  hostname: "winesnap.boleoai.se",
  installationId,
  enabled: true,
  ownerId: id,
});
const user = () => ({ id, email, email_confirmed_at: "2026-11-12T00:00:00Z" });
const local = "http://127.0.0.1:5212";
function api({ users = [user()], active = true, link, returnedId = id, error = null } = {}) {
  return {
    auth: {
      admin: {
        listUsers: vi.fn(async () => ({
          data: { users, total: users.length, nextPage: null },
          error: null,
        })),
        generateLink: vi.fn(async () => ({
          data: {
            user: { id: returnedId, email },
            properties: {
              action_link:
                link ??
                "https://winesnap.boleoai.se/backend/auth/v1/verify?token=synthetic-single-use-token&type=recovery&redirect_to=" +
                  encodeURIComponent(local + "/"),
            },
          },
          error,
        })),
      },
    },
    rpc: vi.fn(async () => ({ data: active, error: null })),
  };
}
describe("private Windows local owner login", () => {
  it("uses the existing owner-only recovery grant and maps its confirmation to loopback", async () => {
    const admin = api();
    const result = await createOwnedLocalLogin(admin, binding(), installationId, email);
    expect(result.ownerId).toBe(id);
    const url = new URL(result.link);
    expect(url.origin).toBe("http://127.0.0.1:54323");
    expect(url.pathname).toBe("/auth/v1/verify");
    expect(url.searchParams.get("redirect_to")).toBe(local + "/");
    expect(admin.auth.admin.generateLink).toHaveBeenCalledExactlyOnceWith({
      type: "recovery",
      email,
      options: { redirectTo: local + "/" },
    });
    expect(admin.rpc).toHaveBeenCalledExactlyOnceWith("privacy_account_active", { _user_id: id });
  });
  it("never creates an account or a grant for a missing, ambiguous, fixture or inactive owner", async () => {
    for (const options of [
      { users: [] },
      { users: [user(), user()] },
      { users: [{ ...user(), app_metadata: { owned_browser_run: "qa" } }] },
      { active: false },
    ]) {
      const admin = api(options);
      await expect(
        createOwnedLocalLogin(admin, binding(), installationId, email),
      ).rejects.toThrow();
      expect(admin.auth.admin.generateLink).not.toHaveBeenCalled();
    }
  });
  it("rejects foreign/disabled owner bindings and failed or wrong-account grants", async () => {
    for (const value of [
      { ...binding(), installationId: "2".repeat(32) },
      { ...binding(), enabled: false },
      { ...binding(), ownerId: "abcdef01-2345-4678-9123-456789abcdef" },
    ])
      await expect(createOwnedLocalLogin(api(), value, installationId, email)).rejects.toThrow();
    for (const options of [
      { returnedId: "abcdef01-2345-4678-9123-456789abcdef" },
      { error: { message: "synthetic" } },
    ])
      await expect(
        createOwnedLocalLogin(api(options), binding(), installationId, email),
      ).rejects.toThrow();
  });
  it.each([
    "https://untrusted.example/auth/v1/verify?token=synthetic-single-use-token&type=recovery&redirect_to=" +
      encodeURIComponent(local + "/"),
    "https://winesnap.boleoai.se/backend/auth/v1/verify?token=synthetic-single-use-token&type=magiclink&redirect_to=" +
      encodeURIComponent(local + "/"),
    "https://winesnap.boleoai.se/backend/auth/v1/verify?token=synthetic-single-use-token&type=recovery&redirect_to=https%3A%2F%2Funtrusted.example%2F",
    "http://127.0.0.1:54323/auth/v1/verify?token=synthetic-single-use-token&type=recovery&redirect_to=" +
      encodeURIComponent(local + "/") +
      "&redirect_to=https%3A%2F%2Funtrusted.example%2F",
    "http://127.0.0.1:54323/auth/v1/verify?token=synthetic-single-use-token&type=recovery&redirect_to=" +
      encodeURIComponent(local + "/") +
      "#secret",
  ])("rejects a malformed or escaping confirmation link", async (link) => {
    await expect(
      createOwnedLocalLogin(api({ link }), binding(), installationId, email),
    ).rejects.toThrow();
  });
  it("limits the viewer to exact loopback origins and blocks providers only during its login check", () => {
    for (const url of [
      local + "/",
      "http://127.0.0.1:54323/auth/v1/user",
      "blob:" + local + "/image",
    ])
      expect(ownedLocalViewRequest(url, false)).toBe("allow");
    for (const url of [
      "https://winesnap.boleoai.se/",
      "http://localhost:5212/",
      "https://untrusted.example/",
      "http://owner:secret@127.0.0.1:5212/",
    ])
      expect(ownedLocalViewRequest(url, false)).toBe("block_external");
    expect(ownedLocalViewRequest(local + "/api/ai/chef", true)).toBe("block_ai");
    expect(ownedLocalViewRequest(local + "/api/ai/chef", false)).toBe("allow");
  });
  it("keeps Windows decryption/private pipes out of browser code and does not alter accounts", () => {
    const wrapper = readFileSync(new URL("../open-owned-local.ps1", import.meta.url), "utf8");
    const worker = readFileSync(new URL("../open-owned-local-worker.mjs", import.meta.url), "utf8");
    expect(wrapper).toContain("ProtectedData]::Unprotect");
    expect(wrapper).toContain("$process.StandardInput.Write($payload)");
    expect(wrapper).toContain("$tunnel.enabled -ne $false");
    expect(wrapper).toContain("Focus-LocalViewer|ConvertTo-Json");
    expect(wrapper).toContain("Invoke-OwnedRuntimeAction -Action Resume");
    expect(wrapper).not.toMatch(
      /Invoke-OwnedRuntimeAction -Action (?:Start|Update|TunnelResume|IngressResume)/,
    );
    expect(wrapper).toContain("$value.phase='unresponsive'");
    expect(worker).toContain("connector.State.Running, false");
    expect(worker).toContain("checkOwnedContainer(container, name, payload.keys.installationId)");
    expect(worker).toContain('redirect: "error"');
    expect(worker).not.toMatch(
      /storageState\(|screenshot\(|updateUserById|createUser\(|deleteUser\(/,
    );
    expect(wrapper).not.toMatch(/ArgumentList.Add\(\$(?:payload|keys|link)/);
  });
});
