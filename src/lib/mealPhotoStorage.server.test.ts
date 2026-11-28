import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { encodeMealPhotoFrame, mealPhotoFrame } from "./mealPhotoFrame.server";
import { createMealPhotoStorageHandler } from "./mealPhotoStorage.server";

const owner = "ba000000-0000-4000-8000-000000000001";
const id = "bb000000-0000-4000-8000-000000000001";
const path = `${owner}/${id}.png`;
const endpoint = `http://127.0.0.1:5212/api/meal-photo?id=${id}`;
const rgb = [145, 32, 41, 81, 99, 27];
type Authorize = Parameters<typeof createMealPhotoStorageHandler>[0]["authorize"];
type Session = NonNullable<Awaited<ReturnType<Authorize>>>;

function request(method: "POST" | "GET" | "DELETE", url = endpoint, token = "synthetic-token") {
  return new Request(url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(method === "POST"
        ? {
            "Content-Type": "application/octet-stream",
            "X-Meal-Photo-Width": "2",
            "X-Meal-Photo-Height": "1",
          }
        : {}),
    },
    ...(method === "POST" ? { body: new Uint8Array(rgb) } : {}),
  });
}

async function makeStored() {
  const input = request("POST");
  const frame = mealPhotoFrame(input)!;
  const png = (await encodeMealPhotoFrame(input, frame, new AbortController().signal))!;
  const digest = createHash("sha256").update(png).digest("hex");
  const blob = new Blob([new Uint8Array(png)], { type: "image/png" });
  return { blob, digest, png };
}

function fixture() {
  const session = {
    owner,
    read: vi
      .fn<Session["read"]>()
      .mockResolvedValue({ photo_state: "pending", photo_sha256: null }),
    transition: vi.fn<Session["transition"]>(),
    put: vi.fn<Session["put"]>().mockResolvedValue(true),
    get: vi.fn<Session["get"]>().mockResolvedValue(null),
    remove: vi.fn<Session["remove"]>().mockResolvedValue(undefined),
  };
  const authorize = vi.fn<Authorize>().mockResolvedValue(session);
  const enabled = vi.fn(() => true);
  return {
    authorize,
    enabled,
    session,
    handle: createMealPhotoStorageHandler({ enabled, authorize }),
  };
}

describe("private meal photo objects", () => {
  it("fails closed outside an enabled owned runtime or without a valid owner", async () => {
    const { authorize, enabled, handle, session } = fixture();
    enabled.mockReturnValueOnce(false);
    expect((await handle(request("GET"))).status).toBe(404);
    expect((await handle(request("GET", endpoint, ""))).status).toBe(401);
    expect((await handle(request("GET", endpoint + "&path=foreign.png"))).status).toBe(400);
    expect(authorize).not.toHaveBeenCalled();
    authorize.mockResolvedValueOnce(null);
    expect((await handle(request("GET"))).status).toBe(401);
    session.read.mockResolvedValue(null);
    for (const method of ["GET", "POST", "DELETE"] as const)
      expect((await handle(request(method))).status).toBe(404);
    expect(session.get).not.toHaveBeenCalled();
    expect(session.put).not.toHaveBeenCalled();
    expect(session.remove).not.toHaveBeenCalled();
    expect(session.transition).not.toHaveBeenCalled();
  });

  it("never uploads or fetches when retention was not chosen", async () => {
    const { handle, session } = fixture();
    session.read.mockResolvedValue({ photo_state: "none", photo_sha256: null });
    expect((await handle(request("POST"))).status).toBe(409);
    expect((await handle(request("GET"))).status).toBe(404);
    session.transition.mockResolvedValue("none");
    expect((await handle(request("DELETE"))).status).toBe(204);
    expect(session.get).not.toHaveBeenCalled();
    expect(session.put).not.toHaveBeenCalled();
    expect(session.remove).not.toHaveBeenCalled();
  });

  it("pins normalized bytes before uploading, then publishes the verified receipt", async () => {
    const { handle, session } = fixture();
    const { digest, png } = await makeStored();
    session.transition.mockResolvedValueOnce("pending").mockResolvedValueOnce("ready");
    const response = await handle(request("POST"));
    expect(await response.json()).toEqual({ photoState: "ready" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(session.transition.mock.calls).toEqual([
      [id, "pin", digest],
      [id, "publish", digest],
    ]);
    expect(session.put).toHaveBeenCalledOnce();
    const [key, blob] = session.put.mock.calls[0];
    expect(key).toBe(path);
    expect(blob.type).toBe("image/png");
    expect(Buffer.from(await blob.arrayBuffer())).toEqual(png);
    const [pin, publish] = session.transition.mock.invocationCallOrder;
    expect(pin).toBeLessThan(session.put.mock.invocationCallOrder[0]);
    expect(publish).toBeGreaterThan(session.put.mock.invocationCallOrder[0]);
  });

  it("recovers an uncertain upload only if the existing bytes match", async () => {
    const { handle, session } = fixture();
    const { blob, digest } = await makeStored();
    session.transition.mockResolvedValueOnce("pending").mockResolvedValueOnce("ready");
    session.put.mockResolvedValue(false);
    session.get.mockResolvedValueOnce(blob);
    expect((await handle(request("POST"))).status).toBe(200);
    expect(session.transition).toHaveBeenLastCalledWith(id, "publish", digest);
    session.transition.mockClear().mockResolvedValue("pending");
    session.get.mockResolvedValueOnce(new Blob(["not the same"], { type: "image/png" }));
    expect((await handle(request("POST"))).status).toBe(503);
    expect(session.transition).toHaveBeenCalledExactlyOnceWith(id, "pin", digest);
  });

  it("does not declare success on a ready replay when the object is missing", async () => {
    const { handle, session } = fixture();
    const { digest } = await makeStored();
    session.read.mockResolvedValue({ photo_state: "ready", photo_sha256: digest });
    session.transition.mockResolvedValue("ready");
    expect((await handle(request("POST"))).status).toBe(503);
    expect(session.put).not.toHaveBeenCalled();
  });

  it("will not overwrite a different photo or publish after concurrent removal", async () => {
    const { handle, session } = fixture();
    session.transition.mockResolvedValueOnce("conflict");
    expect((await handle(request("POST"))).status).toBe(409);
    expect(session.put).not.toHaveBeenCalled();
    session.transition.mockResolvedValueOnce("pending").mockResolvedValueOnce("conflict");
    expect((await handle(request("POST"))).status).toBe(409);
    expect(session.put).toHaveBeenCalledOnce();
  });

  it("serves only the ready, digest-matched owner bytes, with no cache or shared address", async () => {
    const { handle, session } = fixture();
    const { blob, digest, png } = await makeStored();
    expect((await handle(request("GET"))).status).toBe(404);
    expect(session.get).not.toHaveBeenCalled();
    session.read.mockResolvedValue({ photo_state: "ready", photo_sha256: digest });
    session.get.mockResolvedValue(blob);
    const response = await handle(request("GET"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
    expect(session.get).toHaveBeenCalledExactlyOnceWith(path);
  });

  it("does not release a download held during account erasure or removal", async () => {
    const { handle, session } = fixture();
    const { blob, digest } = await makeStored();
    session.get.mockResolvedValue(blob);
    session.read.mockResolvedValueOnce({ photo_state: "ready", photo_sha256: digest });
    session.read.mockResolvedValueOnce(null);
    expect((await handle(request("GET"))).status).toBe(404);
    session.read.mockResolvedValueOnce({ photo_state: "ready", photo_sha256: digest });
    session.read.mockResolvedValueOnce({ photo_state: "removing", photo_sha256: digest });
    expect((await handle(request("GET"))).status).toBe(404);
  });

  it("blocks reads before removal, supports an explicit retry, and completes only after file removal", async () => {
    const { handle, session } = fixture();
    session.transition.mockResolvedValueOnce("removing");
    session.remove.mockRejectedValueOnce(new Error("synthetic Storage timeout"));
    expect((await handle(request("DELETE"))).status).toBe(503);
    expect(session.transition).toHaveBeenCalledExactlyOnceWith(id, "begin_remove");
    session.read.mockResolvedValue({ photo_state: "removing", photo_sha256: null });
    expect((await handle(request("GET"))).status).toBe(404);
    session.transition.mockResolvedValueOnce("removing").mockResolvedValueOnce("removed");
    expect((await handle(request("DELETE"))).status).toBe(204);
    expect(session.transition).toHaveBeenLastCalledWith(id, "finish_remove");
    expect(session.remove).toHaveBeenLastCalledWith(path);
    expect(session.get).not.toHaveBeenCalled();
  });
});
