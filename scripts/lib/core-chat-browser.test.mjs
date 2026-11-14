import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCoreChatFixture } from "./core-chat-browser.mjs";

const origin = "http://127.0.0.1:54323",
  base = "http://127.0.0.1:59999";
const key = "sb_publishable_runtime_check_not_a_real_key";
const owner = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  peer = "cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa";
let fixture, report;
const route = (
  path,
  { target = origin, method = "GET", user = "synthetic-owner", apiKey = key, body = {} } = {},
) => ({
  request: () => ({
    url: () => target + path,
    method: () => method,
    headers: () => ({ apikey: apiKey, authorization: user }),
    postDataJSON: () => body,
    failure: () => null,
  }),
  continue: vi.fn(),
  abort: vi.fn(),
  fulfill: vi.fn(),
});
beforeEach(() => {
  report = { mutations: 0, externalRequests: 0, simulatedAiRequests: 0, simulatedWrites: 0 };
  fixture = createCoreChatFixture({
    origin,
    base,
    key,
    owner,
    report,
    users: new Map([
      ["synthetic-owner", { id: owner }],
      ["synthetic-peer", { id: peer }],
    ]),
  });
});
describe("isolated chat fixture boundary", () => {
  it("mocks owner reads and never forwards to the installed API", async () => {
    const request = route("/rest/v1/ai_conversations?user_id=eq." + owner);
    await fixture.route(request);
    expect(request.continue).not.toHaveBeenCalled();
    expect(JSON.parse(request.fulfill.mock.calls[0][0].body)).toHaveLength(2);
  });
  it("does not return owner history to a second account", async () => {
    const request = route("/rest/v1/ai_conversations?user_id=eq." + peer, {
      user: "synthetic-peer",
    });
    await fixture.route(request);
    expect(JSON.parse(request.fulfill.mock.calls[0][0].body).map((c) => c.user_id)).toEqual([peer]);
  });
  it.each([{ user: "unrecognized" }, { apiKey: "not-the-fixture-key" }])(
    "rejects nonfixture credentials",
    async (options) => {
      const request = route("/auth/v1/user", options);
      await expect(fixture.route(request)).rejects.toThrow();
      expect(request.continue).not.toHaveBeenCalled();
      expect(request.fulfill).not.toHaveBeenCalled();
    },
  );
  it("blocks direct message writes and unknown/external requests", async () => {
    const write = route("/rest/v1/ai_messages", { method: "POST" });
    await fixture.route(write);
    const external = route("/", { target: "https://unapproved.example.invalid" });
    await fixture.route(external);
    expect(write.abort).toHaveBeenCalledOnce();
    expect(external.abort).toHaveBeenCalledOnce();
    expect(report.mutations).toBe(1);
    expect(report.externalRequests).toBe(1);
  });
  it("permits only app page/static reads, never unknown same-origin API calls", async () => {
    const page = route("/ask", { target: base });
    await fixture.route(page);
    const api = route("/api/unknown", { target: base });
    await fixture.route(api);
    expect(page.continue).toHaveBeenCalledOnce();
    expect(api.abort).toHaveBeenCalledOnce();
  });
  it("requires the exact owner filter for a simulated deletion", async () => {
    const path = "/rest/v1/ai_conversations?id=eq." + fixture.conversations[0].id;
    await expect(fixture.route(route(path, { method: "DELETE" }))).rejects.toThrow();
    const request = route(path + "&user_id=eq." + owner, { method: "DELETE" });
    await fixture.route(request);
    expect(fixture.deletes).toEqual([{ owner, id: fixture.conversations[0].id }]);
    expect(request.continue).not.toHaveBeenCalled();
  });
  it("rejects peer conversation IDs in simulated AI requests", async () => {
    const request = route("/api/ai/ask-winesnap", {
      target: base,
      method: "POST",
      body: { message: "Synthetic prompt", conversationId: fixture.conversations[2].id },
    });
    await expect(fixture.route(request)).rejects.toThrow();
    expect(fixture.ai).toEqual([]);
  });
  it("delays synthetic answers without forwarding a provider call", async () => {
    const hold = fixture.hold("ai");
    const request = route("/api/ai/ask-winesnap", {
      target: base,
      method: "POST",
      body: { message: "Synthetic prompt", conversationId: null },
    });
    const pending = fixture.route(request);
    await hold.arrived();
    expect(request.fulfill).not.toHaveBeenCalled();
    hold.release();
    await hold.done();
    await pending;
    expect(request.continue).not.toHaveBeenCalled();
    expect(report.simulatedAiRequests).toBe(1);
  });
});
