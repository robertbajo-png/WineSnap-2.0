import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: mocks.session, getUser: mocks.user },
    functions: { invoke: mocks.invoke },
  },
}));
import { invokePrivacyAction } from "./privacyControls";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({
    data: { session: { access_token: "synthetic-owner-token" } },
    error: null,
  });
  mocks.user.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
  mocks.invoke.mockResolvedValue({ data: { complete: true }, error: null });
});
describe("account-bound privacy commands", () => {
  it("pins the verified token instead of relying on a possibly switched session", async () => {
    await invokePrivacyAction("delete_account", "owner");
    expect(mocks.user).toHaveBeenCalledWith("synthetic-owner-token");
    expect(mocks.invoke).toHaveBeenCalledWith("privacy-controls", {
      headers: { Authorization: "Bearer synthetic-owner-token" },
      body: { action: "delete_account", confirm: "delete_account" },
    });
  });
  it("aborts before mutation if the current token belongs to a different account", async () => {
    mocks.user.mockResolvedValue({ data: { user: { id: "stranger" } }, error: null });
    await expect(invokePrivacyAction("delete_account", "owner")).rejects.toThrow("Account changed");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("does not acknowledge missing or malformed completion responses", async () => {
    mocks.invoke.mockResolvedValue({ data: { queued: true }, error: null });
    await expect(invokePrivacyAction("delete_account", "owner")).rejects.toThrow(
      "Invalid privacy response",
    );
  });
  it("preserves the safe reauthentication signal but not arbitrary server details", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { context: Response.json({ error: "reauthentication_required" }, { status: 403 }) },
    });
    await expect(invokePrivacyAction("reset_memory", "owner")).rejects.toThrow(
      "reauthentication_required",
    );
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { context: Response.json({ error: "private provider details" }, { status: 500 }) },
    });
    await expect(invokePrivacyAction("reset_memory", "owner")).rejects.toThrow(
      "Privacy request failed",
    );
  });
});
