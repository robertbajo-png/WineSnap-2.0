import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("node:http", async (original) => ({
  ...(await original<typeof import("node:http")>()),
  request: transport.request,
}));
import { readOwnedGateState } from "./ownedDeviceSession.server";

beforeEach(() => transport.request.mockReset());
function fixture(statusCode: number, body: string) {
  const response = new EventEmitter() as IncomingMessage;
  response.statusCode = statusCode;
  response.resume = vi.fn(() => response);
  const request = new EventEmitter() as ClientRequest;
  request.destroy = vi.fn((error?: Error) => {
    if (error) request.emit("error", error);
    return request;
  });
  transport.request.mockImplementation((_url, _options, callback) => {
    request.end = vi.fn(() => {
      queueMicrotask(() => {
        callback(response);
        if (statusCode === 200) {
          response.emit("data", Buffer.from(body));
          response.emit("end");
        }
      });
      return request;
    });
    return request;
  });
  return { response, request };
}
describe("private gate HTTP transport", () => {
  it("preserves the allowlisted Host and forwards only the selected gate cookie", async () => {
    fixture(
      200,
      JSON.stringify({ status: "OK", data: { username: "robert", authentication_level: 1 } }),
    );
    expect(await readOwnedGateState("synthetic-gate-cookie")).toEqual({
      username: "robert",
      authentication_level: 1,
    });
    expect(transport.request).toHaveBeenCalledExactlyOnceWith(
      "http://winesnap-owned-internet:8080/gate/api/state",
      {
        headers: {
          Host: "winesnap.boleoai.se",
          Origin: "https://winesnap.boleoai.se",
          Cookie: "synthetic-gate-cookie",
        },
        signal: expect.any(AbortSignal),
      },
      expect.any(Function),
    );
  });
  it("does not follow a redirect or accept another HTTP status", async () => {
    const { response } = fixture(302, "");
    expect(await readOwnedGateState("synthetic-gate-cookie")).toBeNull();
    expect(response.resume).toHaveBeenCalled();
    expect(transport.request).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid provider JSON", async () => {
    fixture(200, "not-json");
    await expect(readOwnedGateState("synthetic-gate-cookie")).rejects.toThrow("Invalid gate state");
  });
  it("bounds the provider response and destroys oversized streams", async () => {
    const { request } = fixture(200, "x".repeat(16385));
    await expect(readOwnedGateState("synthetic-gate-cookie")).rejects.toThrow("Gate state limit");
    expect(request.destroy).toHaveBeenCalled();
  });
});
