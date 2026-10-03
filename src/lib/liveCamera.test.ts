import { afterEach, describe, expect, it, vi } from "vitest";
import { cameraErrorKey, captureCamera, requestCamera } from "./liveCamera";

afterEach(() => vi.unstubAllGlobals());

describe("live camera", () => {
  it("requests the rear camera without microphone access and stops on exit", async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const onStream = vi.fn();
    const cancel = requestCamera({ getUserMedia }, onStream, vi.fn());
    await vi.waitFor(() => expect(onStream).toHaveBeenCalledWith(stream));
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: false,
        video: expect.objectContaining({ facingMode: { ideal: "environment" } }),
      }),
    );
    cancel();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("stops a late permission grant without attaching the abandoned stream", async () => {
    let grant!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve;
        }),
    );
    const stop = vi.fn();
    const onStream = vi.fn();
    requestCamera({ getUserMedia }, onStream, vi.fn())();
    grant({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
    expect(onStream).not.toHaveBeenCalled();
  });

  it("reports permission rejection", async () => {
    const error = new DOMException("Denied", "NotAllowedError");
    const onError = vi.fn();
    requestCamera({ getUserMedia: vi.fn().mockRejectedValue(error) }, vi.fn(), onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(cameraErrorKey(error)).toBe("scan.cameraDenied");
  });

  it("does not report late errors after exit", async () => {
    const onError = vi.fn();
    requestCamera(
      { getUserMedia: vi.fn().mockRejectedValue(new Error("Unavailable")) },
      vi.fn(),
      onError,
    )();
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).not.toHaveBeenCalled();
  });

  it("distinguishes missing camera from a busy camera", () => {
    expect(cameraErrorKey(new DOMException("Missing", "NotFoundError"))).toBe("scan.cameraMissing");
    expect(cameraErrorKey(new DOMException("Busy", "NotReadableError"))).toBe("scan.cameraFailed");
  });

  it("rejects a blank or unready frame", async () => {
    await expect(
      captureCamera({ videoWidth: 0, videoHeight: 0, readyState: 0 } as HTMLVideoElement),
    ).rejects.toThrow("not ready");
  });

  it("captures the full frame as JPEG with bounded dimensions", async () => {
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (callback: BlobCallback) => callback(new Blob(["photo"], { type: "image/jpeg" })),
    };
    vi.stubGlobal("document", { createElement: () => canvas });
    const video = {
      videoWidth: 4096,
      videoHeight: 3072,
      clientWidth: 400,
      clientHeight: 300,
      readyState: 2,
    } as HTMLVideoElement;
    const file = await captureCamera(video);
    expect([canvas.width, canvas.height]).toEqual([2048, 1536]);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 4096, 3072, 0, 0, 2048, 1536);
    expect(file.type).toBe("image/jpeg");
    expect(file.size).toBeGreaterThan(0);
  });

  it("rejects a failed canvas encoding", async () => {
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (callback: BlobCallback) => callback(null),
      }),
    });
    await expect(
      captureCamera({
        videoWidth: 640,
        videoHeight: 480,
        clientWidth: 640,
        clientHeight: 480,
        readyState: 2,
      } as HTMLVideoElement),
    ).rejects.toThrow("capture failed");
  });

  it.each([
    { source: [1920, 1080], frame: [300, 500], crop: [636, 0, 648, 1080] },
    { source: [1080, 1920], frame: [500, 300], crop: [0, 636, 1080, 648] },
  ])(
    "captures exactly the visible centered crop for $source in $frame",
    async ({ source, frame, crop }) => {
      const drawImage = vi.fn();
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toBlob: (callback: BlobCallback) => callback(new Blob(["photo"], { type: "image/jpeg" })),
      };
      vi.stubGlobal("document", { createElement: () => canvas });
      const video = {
        videoWidth: source[0],
        videoHeight: source[1],
        clientWidth: frame[0],
        clientHeight: frame[1],
        readyState: 2,
      } as HTMLVideoElement;
      await captureCamera(video);
      expect([canvas.width, canvas.height]).toEqual(crop.slice(2));
      expect(drawImage).toHaveBeenCalledWith(video, ...crop, 0, 0, canvas.width, canvas.height);
    },
  );

  it("does not capture a hidden preview without dimensions", async () => {
    await expect(
      captureCamera({
        videoWidth: 640,
        videoHeight: 480,
        clientWidth: 0,
        clientHeight: 0,
        readyState: 2,
      } as HTMLVideoElement),
    ).rejects.toThrow("not ready");
  });
});
