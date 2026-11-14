import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({
  data: null as unknown,
  error: "",
  refresh: vi.fn(),
  cursor: 0,
  forced: {} as Record<number, unknown>,
}));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = state.cursor++;
      return actual.useState(Object.hasOwn(state.forced, index) ? state.forced[index] : initial);
    },
  };
});
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: import("react").ReactNode }) => <a>{children}</a>,
}));
vi.mock("./useFreshData", () => ({ useFreshData: () => state }));
vi.mock("./api", () => ({ cellarWines: vi.fn(), familyData: vi.fn() }));
vi.mock("@/i18n", () => ({ useT: () => (key: string) => key }));
import { PairingPanel } from "./PairingPanel";
import { startingRecipes } from "../kitchen/catalog";
const owner = "synthetic-owner";
const version = {
  id: "synthetic-version",
  recipe_id: "synthetic-recipe",
  user_id: owner,
  revision: 1,
  created_at: "synthetic",
  document: { ...startingRecipes[0], title: "Synthetic private recipe" },
};
const render = () =>
  renderToStaticMarkup(<PairingPanel owner={owner} versions={[]} onOpen={vi.fn()} />);
beforeEach(() => {
  state.data = null;
  state.error = "";
  state.refresh.mockReset();
  state.cursor = 0;
  state.forced = {};
});
describe("pairing owner and read boundaries", () => {
  it("keeps a missing recipe selection actionable without silently choosing another recipe", () => {
    state.data = { cellar: { wines: [], truncated: false }, family: { diners: [] } };
    state.forced = { 0: "dish", 1: "missing-recipe", 5: "[]" };
    const html = render();
    expect(html).toContain('aria-label="Rätt"');
    expect(html).toContain("Det valda receptet är inte längre tillgängligt");
    expect(html).not.toContain("Antagen smakprofil");
  });
  it("requires a wine choice instead of implicitly using the first available bottle", () => {
    state.data = {
      cellar: {
        wines: [{ id: "synthetic-wine", user_id: owner, quantity: 1, consumed_at: null }],
        truncated: false,
      },
      family: { diners: [] },
    };
    state.forced = { 0: "wine", 5: "[]" };
    const html = render();
    expect(html).toContain("journey.chooseWine");
    expect(html).not.toContain('class="meal-results"');
    expect(html).toContain('value="" disabled="" selected=""');
  });
  it("does not substitute another bottle for a missing explicit wine", () => {
    state.data = {
      cellar: {
        wines: [{ id: "other-wine", user_id: owner, quantity: 1, consumed_at: null }],
        truncated: false,
      },
      family: { diners: [] },
    };
    state.forced = { 0: "wine", 2: "missing-wine", 5: "[]" };
    const html = render();
    expect(html).toContain("journey.wineUnavailable");
    expect(html).not.toContain('class="meal-results"');
  });
  it("owns its account key and refuses an initial recipe belonging to another owner", () => {
    const first = PairingPanel({ owner, versions: [], initial: version, onOpen: vi.fn() });
    const second = PairingPanel({
      owner: "synthetic-peer",
      versions: [],
      initial: version,
      onOpen: vi.fn(),
    });
    expect(first.key).toBe(owner);
    expect(first.props.initial).toBe(version);
    expect(second.key).toBe("synthetic-peer");
    expect(second.props.initial).toBeUndefined();
  });
  it("announces loading without pretending a read succeeded with no profiles", () => {
    const html = render();
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("Inga matprofiler valda");
    expect(state.refresh).not.toHaveBeenCalled();
  });
  it("retains an accessible manual read command after failure without automatic retry", () => {
    state.error = "Synthetic read failure";
    const html = render();
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-label="Hämta mat- och vinuppgifter"');
    expect(html).not.toContain("Inga matprofiler valda");
    expect(state.refresh).not.toHaveBeenCalled();
  });
  it("starts with adult wine suggestions off after a successful read", () => {
    state.data = { cellar: { wines: [], truncated: false }, family: { diners: [] } };
    const html = render();
    expect(html).toContain("Visa vinförslag till vuxna");
    expect(html).not.toContain('checked=""');
    expect(html).not.toContain('class="meal-mode"');
    expect(html).toContain("Mat till sällskapet");
  });
  it("does not render another owner's cached recipe among available food choices", () => {
    state.data = { cellar: { wines: [], truncated: false }, family: { diners: [] } };
    const html = renderToStaticMarkup(
      <PairingPanel
        owner="synthetic-peer"
        versions={[version]}
        initial={version}
        onOpen={vi.fn()}
      />,
    );
    expect(html).not.toContain(version.document.title);
  });
});
