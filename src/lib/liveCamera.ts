export function cameraErrorKey(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "scan.cameraDenied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "scan.cameraMissing";
  return "scan.cameraFailed";
}

// A permission prompt can resolve after the camera view has already closed.
export function requestCamera(
  devices: Pick<MediaDevices, "getUserMedia">,
  onStream: (stream: MediaStream) => void,
  onError: (error: unknown) => void,
) {
  let cancelled = false;
  let stream: MediaStream | undefined;
  void devices
    .getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    })
    .then((result) => {
      stream = result;
      if (cancelled) result.getTracks().forEach((track) => track.stop());
      else onStream(result);
    })
    .catch((error: unknown) => {
      if (!cancelled) onError(error);
    });
  return () => {
    cancelled = true;
    stream?.getTracks().forEach((track) => track.stop());
  };
}

export async function captureCamera(video: HTMLVideoElement): Promise<File> {
  if (
    !video.videoWidth ||
    !video.videoHeight ||
    !video.clientWidth ||
    !video.clientHeight ||
    video.readyState < 2
  ) {
    throw new Error("Camera frame is not ready");
  }
  const canvas = document.createElement("canvas");
  // Match the centered object-cover preview, not the unseen camera edges.
  const frameRatio = video.clientWidth / video.clientHeight;
  const sourceWidth = Math.min(video.videoWidth, video.videoHeight * frameRatio);
  const sourceHeight = Math.min(video.videoHeight, video.videoWidth / frameRatio);
  const sourceX = (video.videoWidth - sourceWidth) / 2;
  const sourceY = (video.videoHeight - sourceHeight) / 2;
  const scale = Math.min(1, 2048 / Math.max(sourceWidth, sourceHeight));
  canvas.width = Math.round(sourceWidth * scale);
  canvas.height = Math.round(sourceHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Camera capture is unavailable");
  context.drawImage(
    video,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Camera capture failed"))),
      "image/jpeg",
      0.92,
    );
  });
  return new File([blob], `winesnap-${Date.now()}.jpg`, { type: "image/jpeg" });
}
