import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { ownedApp } from "./owned-backend.mjs";
import { ownedMemoryLabels as labels, withOwnedMemoryProbe } from "./owned-memory-probe.mjs";
import { acceptOwnedMemoryStates, acceptOwnedMemoryAccountStates } from "./owned-memory-states.mjs";

vi.mock("./owned-memory-probe.mjs", async (original) => ({
  ...(await original()),
  withOwnedMemoryProbe: vi.fn(),
}));
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
function fakePage() {
  let url = ownedApp + "/kitchen",
    closed = false;
  const root = { evaluate: vi.fn(async () => true), dispose: vi.fn().mockResolvedValue() };
  const node = {
    click: vi.fn(),
    fill: vi.fn(),
    waitFor: vi.fn(),
    focus: vi.fn(),
    evaluate: vi.fn(),
    selectOption: vi.fn(),
    inputValue: vi.fn(async () => labels.draft),
    count: vi.fn(async () => 0),
    isVisible: vi.fn(async () => false),
    isDisabled: vi.fn(async () => true),
    elementHandle: vi.fn(async () => root),
    or: vi.fn(),
    first: vi.fn(),
    locator: vi.fn(),
    getByRole: vi.fn(),
  };
  for (const key of ["or", "first", "locator", "getByRole"]) node[key].mockReturnValue(node);
  return {
    url: () => url,
    goto: vi.fn(async (next) => {
      url = next;
    }),
    getByRole: vi.fn(() => node),
    getByLabel: vi.fn(() => node),
    getByText: vi.fn(() => node),
    locator: vi.fn(() => node),
    keyboard: { press: vi.fn() },
    evaluate: vi.fn(),
    setViewportSize: vi.fn(),
    close: vi.fn(async () => {
      closed = true;
    }),
    isClosed: () => closed,
    node,
    root,
  };
}
let fixture,
  peer,
  page,
  memoryPage,
  context,
  phase,
  pass,
  capture,
  switchAccount,
  probe,
  writes,
  injected,
  inspections,
  released;
const args = () => ({ page, context, fixture, phase, pass, capture });
const accountArgs = () => ({ context, fixture, peerFixture: peer, phase, pass, switchAccount });
beforeEach(() => {
  vi.resetAllMocks();
  fixture = manifest();
  peer = manifest();
  page = fakePage();
  memoryPage = fakePage();
  memoryPage.node.inputValue.mockResolvedValue("");
  context = { newPage: vi.fn(async () => memoryPage) };
  phase = vi.fn();
  pass = vi.fn();
  capture = vi.fn();
  switchAccount = vi.fn();
  writes = 0;
  injected = 0;
  inspections = 0;
  released = 0;
  probe = {
    arm: vi.fn((step) => {
      writes++;
      if (step === "correct-conflict") injected++;
    }),
    fault: vi.fn(),
    inspectServerCorrection: vi.fn(async () => {
      inspections++;
    }),
    waitReadFault: vi.fn(),
    waitHeld: vi.fn(),
    waitReleased: vi.fn(),
    release: vi.fn(() => {
      released++;
    }),
    beginAccountSwitch: vi.fn(),
    completeAccountSwitch: vi.fn(),
    assertForeignReads: vi.fn(),
    close: vi.fn(),
    snapshot: vi.fn(() => ({
      clientWrites: writes,
      rpcRequests: writes + injected,
      commits: writes,
      injectedEdits: injected,
      inspectionReads: inspections,
      releasedReplies: released,
      accountSwitches: probe.beginAccountSwitch.mock.calls.length,
      peerReadRequests: 1,
      peerMemoryReads: 1,
      fixtureErrors: 0,
      blockedSwitchWrites: 0,
      blockedStaleReads: 0,
      unexpectedAi: 0,
    })),
  };
  vi.mocked(withOwnedMemoryProbe).mockImplementation(async (_, run) => {
    try {
      return await run(probe);
    } finally {
      await probe.close();
    }
  });
});

describe("owned memory recovery orchestration preparation", () => {
  it("uses bounded fixture modes without replaying uncertain saves or revising the draft", async () => {
    const result = await acceptOwnedMemoryStates(args());
    expect(result).toMatchObject({
      completed: true,
      liveProvider: false,
      clientWrites: 5,
      rpcRequests: 6,
      commits: 5,
      injectedEdits: 1,
    });
    expect(probe.arm.mock.calls).toEqual([
      ["add-read-error"],
      ["correct-conflict"],
      ["forget-lost"],
      ["reset-lost"],
      ["add-late"],
    ]);
    expect(probe.inspectServerCorrection).toHaveBeenCalledOnce();
    expect(probe.waitReadFault).toHaveBeenCalledOnce();
    expect(pass).toHaveBeenCalledTimes(5);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(page.root.dispose).toHaveBeenCalledOnce();
    expect(probe.close).toHaveBeenCalledOnce();
    expect(page.close).not.toHaveBeenCalled();
    expect(page.goto.mock.calls.map(([url]) => url)).toEqual([
      ownedApp + "/kitchen#memory",
      ownedApp + "/kitchen#chef",
      ownedApp + "/kitchen#memory",
    ]);
    expect(context.newPage).not.toHaveBeenCalled();
  });
  it("rejects a foreign origin before installing any route", async () => {
    page.url = () => "https://unapproved.example.invalid/kitchen";
    await expect(acceptOwnedMemoryStates(args())).rejects.toThrow();
    expect(withOwnedMemoryProbe).not.toHaveBeenCalled();
  });
  it("fails if the conflict draft was silently replaced", async () => {
    page.node.inputValue.mockResolvedValue(labels.server);
    await expect(acceptOwnedMemoryStates(args())).rejects.toThrow();
    expect(probe.arm.mock.calls).toEqual([["add-read-error"], ["correct-conflict"]]);
    expect(probe.close).toHaveBeenCalledOnce();
  });
  it("does not finish an unknown result while new destructive writes remain enabled", async () => {
    page.getByRole.mockImplementation((_, options) =>
      options.name === "Nollst\u00e4ll matminne"
        ? { ...page.node, isDisabled: vi.fn(async () => false) }
        : page.node,
    );
    await expect(acceptOwnedMemoryStates(args())).rejects.toThrow();
    expect(probe.arm).toHaveBeenCalledTimes(3);
    expect(probe.close).toHaveBeenCalledOnce();
  });
  it("never accepts a document reload as the late-view proof", async () => {
    page.root.evaluate.mockResolvedValue(false);
    await expect(acceptOwnedMemoryStates(args())).rejects.toThrow();
    expect(probe.release).not.toHaveBeenCalled();
    expect(page.root.dispose).toHaveBeenCalledOnce();
    expect(probe.close).toHaveBeenCalledOnce();
  });
  it("rejects the late success notice in another view", async () => {
    page.getByText.mockImplementation((text, options) =>
      text === "Matminnet \u00e4r uppdaterat." && options.exact
        ? { ...page.node, count: vi.fn(async () => 1) }
        : page.node,
    );
    await expect(acceptOwnedMemoryStates(args())).rejects.toThrow();
    expect(pass).toHaveBeenCalledTimes(4);
    expect(page.root.dispose).toHaveBeenCalledOnce();
  });
  it("still cleans the guard if a fixture screenshot fails", async () => {
    capture.mockRejectedValue(Error("synthetic_capture_failure"));
    await expect(acceptOwnedMemoryStates(args())).rejects.toThrow("synthetic_capture_failure");
    expect(probe.close).toHaveBeenCalledOnce();
    expect(page.close).not.toHaveBeenCalled();
  });
});

describe("owned memory account orchestration preparation", () => {
  it("keeps the original document until peer reads and late-reply checks complete", async () => {
    const result = await acceptOwnedMemoryAccountStates(accountArgs());
    expect(result).toMatchObject({
      completed: true,
      liveProvider: false,
      withheldPeerView: false,
      clientWrites: 1,
      privateTablesDenied: 3,
    });
    expect(switchAccount).toHaveBeenCalledOnce();
    expect(probe.beginAccountSwitch).toHaveBeenCalledExactlyOnceWith(peer, memoryPage);
    expect(probe.release.mock.invocationCallOrder[0]).toBeGreaterThan(
      probe.completeAccountSwitch.mock.invocationCallOrder[0],
    );
    expect(memoryPage.goto).toHaveBeenCalledExactlyOnceWith(ownedApp + "/kitchen#memory", {
      waitUntil: "domcontentloaded",
    });
    expect(memoryPage.root.evaluate).toHaveBeenCalledTimes(2);
    expect(probe.assertForeignReads).toHaveBeenCalledOnce();
    expect(memoryPage.close).toHaveBeenCalledOnce();
    expect(memoryPage.close.mock.invocationCallOrder[0]).toBeLessThan(
      probe.close.mock.invocationCallOrder[0],
    );
    expect(memoryPage.root.dispose).toHaveBeenCalledOnce();
    expect(pass).toHaveBeenCalledOnce();
  });
  it.each(["sameOwner", "sameRun", "realEmail", "missingSwitch"])(
    "rejects %s before opening any page",
    async (kind) => {
      const input = accountArgs();
      if (kind === "sameOwner") input.peerFixture = { ...peer, userId: fixture.userId };
      if (kind === "sameRun")
        input.peerFixture = { ...peer, run: fixture.run, email: fixture.email };
      if (kind === "realEmail") input.peerFixture = { ...peer, email: "real@example.com" };
      if (kind === "missingSwitch") input.switchAccount = undefined;
      await expect(acceptOwnedMemoryAccountStates(input)).rejects.toThrow();
      expect(context.newPage).not.toHaveBeenCalled();
      expect(switchAccount).not.toHaveBeenCalled();
    },
  );
  it("does not count a cache guard as successful memory-panel rendering", async () => {
    const snapshot = probe.snapshot.getMockImplementation();
    probe.snapshot.mockImplementation(() => ({ ...snapshot(), peerMemoryReads: 0 }));
    memoryPage.getByText.mockImplementation((text) =>
      text.startsWith("K\u00f6ket \u00e4ndrades")
        ? { ...memoryPage.node, isVisible: vi.fn(async () => true) }
        : memoryPage.node,
    );
    await expect(acceptOwnedMemoryAccountStates(accountArgs())).resolves.toMatchObject({
      withheldPeerView: true,
      peerMemoryReads: 0,
    });
    expect(memoryPage.node.click).toHaveBeenCalledOnce();
    expect(probe.completeAccountSwitch).toHaveBeenCalledOnce();
    expect(memoryPage.goto).toHaveBeenCalledOnce();
  });
  it("does not accept a visible empty memory panel without a verified memory read", async () => {
    const snapshot = probe.snapshot.getMockImplementation();
    probe.snapshot.mockImplementation(() => ({ ...snapshot(), peerMemoryReads: 0 }));
    await expect(acceptOwnedMemoryAccountStates(accountArgs())).rejects.toThrow();
    expect(probe.release).not.toHaveBeenCalled();
    expect(memoryPage.close).toHaveBeenCalledOnce();
  });
  it("rejects a supposedly withheld view that still exposes the memory panel", async () => {
    memoryPage.getByText.mockImplementation((text) =>
      text.startsWith("K\u00f6ket \u00e4ndrades")
        ? { ...memoryPage.node, isVisible: vi.fn(async () => true) }
        : memoryPage.node,
    );
    memoryPage.locator.mockImplementation((selector) =>
      selector === ".chef-panel"
        ? { ...memoryPage.node, count: vi.fn(async () => 1) }
        : memoryPage.node,
    );
    await expect(acceptOwnedMemoryAccountStates(accountArgs())).rejects.toThrow();
    expect(probe.release).not.toHaveBeenCalled();
  });
  it("rejects a document replacement rather than navigating past the proof", async () => {
    memoryPage.root.evaluate.mockResolvedValue(false);
    await expect(acceptOwnedMemoryAccountStates(accountArgs())).rejects.toThrow();
    expect(probe.release).not.toHaveBeenCalled();
    expect(memoryPage.goto).toHaveBeenCalledOnce();
  });
  it.each(["Matminnet \u00e4r uppdaterat.", "Svaret saknas."])(
    "rejects stale notice %s",
    async (text) => {
      memoryPage.getByText.mockImplementation((value) =>
        value === text ? { ...memoryPage.node, count: vi.fn(async () => 1) } : memoryPage.node,
      );
      await expect(acceptOwnedMemoryAccountStates(accountArgs())).rejects.toThrow();
      expect(pass).not.toHaveBeenCalled();
      expect(memoryPage.close).toHaveBeenCalledOnce();
    },
  );
  it("cleans its own page and guard even when normal control-tab sign-in fails", async () => {
    switchAccount.mockRejectedValue(Error("synthetic_signin_failure"));
    await expect(acceptOwnedMemoryAccountStates(accountArgs())).rejects.toThrow(
      "synthetic_signin_failure",
    );
    expect(probe.release).not.toHaveBeenCalled();
    expect(probe.close).toHaveBeenCalledOnce();
    expect(memoryPage.root.dispose).toHaveBeenCalledOnce();
    expect(memoryPage.close).toHaveBeenCalledOnce();
  });
  it("never reports success with failed page cleanup", async () => {
    memoryPage.close.mockRejectedValue(Error("synthetic_close_failure"));
    await expect(acceptOwnedMemoryAccountStates(accountArgs())).rejects.toThrow(
      "owned_memory_account_cleanup_failed",
    );
    expect(probe.close).toHaveBeenCalledOnce();
    expect(memoryPage.root.dispose).toHaveBeenCalledOnce();
  });
  it("retains fixture-only setup, normal sign-in and both exact cascade cleanups", () => {
    const source = readFileSync(new URL("./owned-pilot-browser.mjs", import.meta.url), "utf8");
    expect(source).toContain("report.memoryStates =");
    expect(source).toContain("report.memoryAccountStates =");
    expect(source).toContain('phase("logout")');
    expect(source.match(/cleanupMemory: true/g)).toHaveLength(2);
    const helper = readFileSync(new URL("./owned-memory-states.mjs", import.meta.url), "utf8");
    expect(helper).not.toMatch(
      /setSession\(|storageState\(|localStorage|cookies\(|createClient\(|console\.|writeFile/,
    );
    expect(helper).not.toContain("page.reload");
  });
});
