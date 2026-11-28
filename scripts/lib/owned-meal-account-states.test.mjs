import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { ownedApp } from "./owned-backend.mjs";
import { ownedMealSessionId } from "./owned-browser-fixture.mjs";
import { acceptOwnedMealAccountStates } from "./owned-meal-account-states.mjs";
import { withOwnedMealProbe } from "./owned-meal-states.mjs";

vi.mock("./owned-meal-states.mjs", () => ({ withOwnedMealProbe: vi.fn() }));
function manifest() {
  const run = randomUUID();
  return {
    project: "winesnap-owned-local",
    run,
    email: `owned-browser-${run}@example.test`,
    ...Object.fromEntries(
      ["userId", "wineId", "noteId", "shareId", "versionId", "sessionId"].map((key) => [
        key,
        randomUUID(),
      ]),
    ),
  };
}
let fixture, peer, context, page, mealPage, controlPage, probe, switchAccount, phase, pass;
function fakePage() {
  let url = ownedApp + "/kitchen",
    closed = false;
  const root = {
    evaluate: vi.fn(async (fn) => fn({ isConnected: true })),
    dispose: vi.fn().mockResolvedValue(),
  };
  const node = {
    click: vi.fn(),
    fill: vi.fn(),
    waitFor: vi.fn(),
    count: vi.fn(async () => 0),
    elementHandle: vi.fn(async () => root),
    isVisible: vi.fn(async () => false),
    or: vi.fn(),
    first: vi.fn(),
    locator: vi.fn(),
    getByRole: vi.fn(),
    nth: vi.fn((index) => ({
      inputValue: vi.fn(async () => (index === 0 ? ownedMealSessionId(fixture) : fixture.wineId)),
    })),
  };
  node.locator.mockReturnValue(node);
  node.getByRole.mockReturnValue(node);
  node.or.mockReturnValue(node);
  node.first.mockReturnValue(node);
  return {
    url: () => url,
    goto: vi.fn(async (target) => {
      url = target;
    }),
    getByRole: vi.fn(() => node),
    getByLabel: vi.fn(() => node),
    getByText: vi.fn(() => node),
    locator: vi.fn(() => node),
    evaluate: vi.fn(),
    close: vi.fn(async () => {
      closed = true;
    }),
    isClosed: () => closed,
    root,
    node,
  };
}
const input = () => ({ page, context, fixture, peerFixture: peer, switchAccount, phase, pass });
beforeEach(() => {
  vi.resetAllMocks();
  fixture = manifest();
  peer = manifest();
  page = fakePage();
  mealPage = fakePage();
  controlPage = fakePage();
  context = { newPage: vi.fn().mockResolvedValueOnce(mealPage).mockResolvedValueOnce(controlPage) };
  switchAccount = vi.fn();
  phase = vi.fn();
  pass = vi.fn();
  probe = {
    arm: vi.fn(),
    waitHeld: vi.fn(),
    beginAccountSwitch: vi.fn(),
    completeAccountSwitch: vi.fn(),
    release: vi.fn(),
    waitReleased: vi.fn(),
    assertForeignReads: vi.fn(),
    snapshot: vi.fn(() => ({
      inspectionReads: 0,
      clientWriteRequests: 2,
      forwardedRpcRequests: 2,
      committedWrites: 2,
      accountSwitches: 1,
      releasedReplies: 2,
      blockedSwitchWrites: 0,
      blockedStaleReads: 0,
      fixtureErrors: 0,
    })),
  };
  vi.mocked(withOwnedMealProbe).mockImplementation(async (_, run) => run(probe));
});

describe("owned late-account browser orchestration preparation", () => {
  it.each(["sameOwner", "sameRun", "realEmail", "foreignOrigin", "missingSwitch"])(
    "rejects %s before browser or fixture activity",
    async (kind) => {
      const args = input();
      if (kind === "sameOwner") args.peerFixture = { ...peer, userId: fixture.userId };
      if (kind === "sameRun")
        args.peerFixture = { ...peer, run: fixture.run, email: fixture.email };
      if (kind === "realEmail") args.peerFixture = { ...peer, email: "real@example.com" };
      if (kind === "foreignOrigin") args.page = { url: () => "https://unapproved.example.invalid" };
      if (kind === "missingSwitch") args.switchAccount = undefined;
      await expect(acceptOwnedMealAccountStates(args)).rejects.toThrow();
      expect(withOwnedMealProbe).not.toHaveBeenCalled();
      expect(context.newPage).not.toHaveBeenCalled();
      expect(switchAccount).not.toHaveBeenCalled();
    },
  );
  it("keeps both original documents while normal sign-in occurs only in the control tab", async () => {
    const result = await acceptOwnedMealAccountStates(input());
    expect(result).toMatchObject({
      completed: true,
      liveProvider: false,
      committedWrites: 2,
      privateTablesDenied: 3,
      withheldPeerViews: 0,
    });
    expect(probe.arm.mock.calls).toEqual([["profile-account-late"], ["meal-account-late"]]);
    expect(probe.beginAccountSwitch).toHaveBeenCalledExactlyOnceWith(peer, [page, mealPage]);
    expect(switchAccount).toHaveBeenCalledExactlyOnceWith(controlPage);
    expect(probe.completeAccountSwitch).toHaveBeenCalledOnce();
    expect(probe.release.mock.invocationCallOrder[0]).toBeGreaterThan(
      probe.completeAccountSwitch.mock.invocationCallOrder[0],
    );
    expect(page.goto).toHaveBeenCalledExactlyOnceWith(ownedApp + "/kitchen#family", {
      waitUntil: "domcontentloaded",
    });
    expect(mealPage.goto).toHaveBeenCalledExactlyOnceWith(ownedApp + "/kitchen#meals", {
      waitUntil: "domcontentloaded",
    });
    expect(page.root.evaluate).toHaveBeenCalled();
    expect(mealPage.root.evaluate).toHaveBeenCalled();
    expect(probe.assertForeignReads).toHaveBeenCalledExactlyOnceWith(fixture);
    expect(page.close).not.toHaveBeenCalled();
    expect(mealPage.close).toHaveBeenCalledOnce();
    expect(controlPage.close).toHaveBeenCalledOnce();
    expect(pass).toHaveBeenCalledOnce();
  });
  it("closes only its own pages and disposes roots when sign-in fails", async () => {
    switchAccount.mockRejectedValue(Error("synthetic_signin_failure"));
    await expect(acceptOwnedMealAccountStates(input())).rejects.toThrow("synthetic_signin_failure");
    expect(probe.completeAccountSwitch).not.toHaveBeenCalled();
    expect(probe.release).not.toHaveBeenCalled();
    expect(pass).not.toHaveBeenCalled();
    expect(page.close).not.toHaveBeenCalled();
    expect(mealPage.close).toHaveBeenCalledOnce();
    expect(controlPage.close).toHaveBeenCalledOnce();
    expect(page.root.dispose).toHaveBeenCalledOnce();
    expect(mealPage.root.dispose).toHaveBeenCalledOnce();
  });
  it("captures only the fixture meal page on failure and retains the original error", async () => {
    switchAccount.mockRejectedValue(Error("synthetic_signin_failure"));
    const captureFailure = vi.fn().mockRejectedValue(Error("synthetic_capture_failure"));
    await expect(acceptOwnedMealAccountStates({ ...input(), captureFailure })).rejects.toThrow(
      "synthetic_signin_failure",
    );
    expect(captureFailure).toHaveBeenCalledExactlyOnceWith(mealPage);
    expect(mealPage.close).toHaveBeenCalledOnce();
    expect(controlPage.close).toHaveBeenCalledOnce();
    expect(page.close).not.toHaveBeenCalled();
  });
  it("keeps a cache-conflicted peer document withheld without reloading or releasing early", async () => {
    const recoveryClick = vi.fn();
    mealPage.getByRole.mockImplementation((_, options) =>
      options.name === "H\u00e4mta igen"
        ? { ...mealPage.node, click: recoveryClick }
        : mealPage.node,
    );
    mealPage.getByText.mockImplementation((text) =>
      text.startsWith("K\u00f6ket \u00e4ndrades i en annan flik.")
        ? { ...mealPage.node, isVisible: vi.fn(async () => true) }
        : mealPage.node,
    );
    const result = await acceptOwnedMealAccountStates(input());
    expect(result.withheldPeerViews).toBe(1);
    expect(mealPage.locator).toHaveBeenCalledWith(".meal-panel");
    expect(probe.completeAccountSwitch).toHaveBeenCalledOnce();
    expect(probe.release.mock.invocationCallOrder[0]).toBeGreaterThan(
      probe.completeAccountSwitch.mock.invocationCallOrder[0],
    );
    expect(mealPage.goto).toHaveBeenCalledOnce();
    expect(mealPage.root.evaluate).toHaveBeenCalled();
    expect(mealPage.node.click).toHaveBeenCalledTimes(2);
    expect(recoveryClick).not.toHaveBeenCalled();
  });
  it("rejects a cache-conflict notice that still exposes a private meal panel", async () => {
    mealPage.getByText.mockImplementation((text) =>
      text.startsWith("K\u00f6ket \u00e4ndrades i en annan flik.")
        ? { ...mealPage.node, isVisible: vi.fn(async () => true) }
        : mealPage.node,
    );
    mealPage.locator.mockImplementation((selector) =>
      selector === ".meal-panel"
        ? { ...mealPage.node, count: vi.fn(async () => 1) }
        : mealPage.node,
    );
    await expect(acceptOwnedMealAccountStates(input())).rejects.toThrow();
    expect(probe.release).not.toHaveBeenCalled();
    expect(pass).not.toHaveBeenCalled();
    expect(mealPage.close).toHaveBeenCalledOnce();
  });
  it("does not accept a reload replacing an original document as a cross-account test", async () => {
    page.root.evaluate.mockResolvedValue(false);
    await expect(acceptOwnedMealAccountStates(input())).rejects.toThrow();
    expect(probe.completeAccountSwitch).not.toHaveBeenCalled();
    expect(pass).not.toHaveBeenCalled();
    expect(controlPage.close).toHaveBeenCalledOnce();
  });
  it("rejects a stale meal-saved notice on the peer's page", async () => {
    mealPage.getByText.mockImplementation((text) =>
      text === "M\u00e5ltiden sparades."
        ? { ...mealPage.node, count: vi.fn(async () => 1) }
        : mealPage.node,
    );
    await expect(acceptOwnedMealAccountStates(input())).rejects.toThrow();
    expect(pass).not.toHaveBeenCalled();
    expect(mealPage.close).toHaveBeenCalledOnce();
    expect(controlPage.close).toHaveBeenCalledOnce();
  });
  it("does not begin sign-in before both writes are proved committed", async () => {
    probe.snapshot.mockReturnValue({ committedWrites: 1 });
    await expect(acceptOwnedMealAccountStates(input())).rejects.toThrow();
    expect(probe.beginAccountSwitch).not.toHaveBeenCalled();
    expect(switchAccount).not.toHaveBeenCalled();
    expect(context.newPage).toHaveBeenCalledOnce();
    expect(mealPage.close).toHaveBeenCalledOnce();
  });
  it("checks final counters after the peer's RLS reads, not an earlier snapshot", async () => {
    probe.assertForeignReads.mockImplementation(async () => {
      probe.snapshot.mockReturnValue({
        inspectionReads: 0,
        clientWriteRequests: 2,
        forwardedRpcRequests: 2,
        committedWrites: 2,
        accountSwitches: 1,
        releasedReplies: 2,
        blockedSwitchWrites: 1,
        blockedStaleReads: 0,
        fixtureErrors: 1,
      });
    });
    await expect(acceptOwnedMealAccountStates(input())).rejects.toThrow();
    expect(pass).not.toHaveBeenCalled();
    expect(mealPage.close).toHaveBeenCalledOnce();
    expect(controlPage.close).toHaveBeenCalledOnce();
  });
  it("still closes the meal page if control-page creation fails", async () => {
    context.newPage
      .mockReset()
      .mockResolvedValueOnce(mealPage)
      .mockRejectedValueOnce(Error("synthetic_page_failure"));
    await expect(acceptOwnedMealAccountStates(input())).rejects.toThrow("synthetic_page_failure");
    expect(switchAccount).not.toHaveBeenCalled();
    expect(mealPage.close).toHaveBeenCalledOnce();
  });
  it("attempts every page cleanup and rejects a partial cleanup", async () => {
    controlPage.close.mockRejectedValue(Error("synthetic_close_failure"));
    await expect(acceptOwnedMealAccountStates(input())).rejects.toThrow(
      "owned_meal_account_page_cleanup_failed",
    );
    expect(mealPage.close).toHaveBeenCalledOnce();
    expect(page.close).not.toHaveBeenCalled();
  });
  it("preserves the prior logout/isolation stages and never injects a browser session", () => {
    const source = readFileSync(
      new URL("./owned-pilot-browser.mjs", import.meta.url),
      "utf8",
    ).replace(/\r\n/g, "\n");
    expect(source.indexOf("report.mealAccountStates =")).toBeGreaterThan(
      source.indexOf("report.mealStates ="),
    );
    expect(source.indexOf("report.mealAccountStates =")).toBeLessThan(
      source.indexOf('phase("peer_account_isolation")'),
    );
    expect(source).toContain('report.passed.push("logout_hides_private_home")');
    expect(source).toContain("report.mealIsolation =");
    expect(source).toContain(
      'await page.goto(ownedApp + "/kitchen#memory");\n      // The held-reply proof is complete. Recover any multi-tab cache conflict before fresh reads.\n      await page.reload({ waitUntil: "domcontentloaded" });',
    );
    expect(source.match(/cleanupMeals: true/g)).toHaveLength(2);
    const helper = readFileSync(
      new URL("./owned-meal-account-states.mjs", import.meta.url),
      "utf8",
    );
    expect(helper).not.toMatch(
      /storageState\(|setSession\(|localStorage|cookies\(|createClient\(|console\.|writeFile/,
    );
  });
});
