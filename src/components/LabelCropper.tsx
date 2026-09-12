import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { RotateCw, RotateCcw, X, Check, Loader2, Maximize2 } from "lucide-react";
import { useT } from "@/i18n";

type Props = {
  file: File;
  onCancel: () => void;
  /** Receives the cropped image, or the untouched original when the user keeps the full photo. */
  onConfirm: (image: Blob, meta: { cropped: boolean; mimeType: string }) => void | Promise<void>;
  onError?: (error: unknown) => void;
  busy?: boolean;
};

const MAX_OUTPUT_EDGE = 2200;

export function LabelCropper({ file, onCancel, onConfirm, onError, busy }: Props) {
  const t = useT();
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pixels, setPixels] = useState<Area | null>(null);

  // Object URL lifecycle is bound to the current file: recreated on change,
  // revoked on unmount so a cancelled attempt never leaks or reuses a stale URL.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setPixels(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropComplete = useCallback((_: Area, areaPx: Area) => setPixels(areaPx), []);

  const outputMime = file.type === "image/png" ? "image/png" : "image/jpeg";

  const handleConfirm = async () => {
    if (!pixels || !imageSrc || busy) return;
    try {
      const blob = await getCroppedBlob(imageSrc, pixels, rotation, outputMime);
      await onConfirm(blob, { cropped: true, mimeType: outputMime });
    } catch (e) {
      console.error("[LabelCropper] crop failed", e);
      onError?.(e);
    }
  };

  const handleUseOriginal = async () => {
    if (busy) return;
    await onConfirm(file, { cropped: false, mimeType: file.type || "image/jpeg" });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black text-cream"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <header className="flex items-center justify-between px-4 pt-3">
        <button
          onClick={onCancel}
          aria-label={t("crop.retake")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="text-sm text-cream/80">{t("crop.adjust")}</p>
        <span className="h-9 w-9" />
      </header>

      <div className="relative flex-1">
        {imageSrc && (
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={3 / 4}
            showGrid
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
          />
        )}
      </div>

      <div className="flex items-center justify-center gap-3 px-4 pt-4">
        <button
          onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
          aria-label="Rotate left"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
        >
          <RotateCcw className="h-5 w-5" />
        </button>
        <input
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="h-1.5 flex-1 max-w-xs accent-gold"
          aria-label="Zoom"
        />
        <button
          onClick={() => setRotation((r) => (r + 90) % 360)}
          aria-label="Rotate right"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
        >
          <RotateCw className="h-5 w-5" />
        </button>
      </div>

      <button
        onClick={handleUseOriginal}
        disabled={busy}
        className="mx-auto mt-4 flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-cream/85 hover:bg-white/10 disabled:opacity-50"
      >
        <Maximize2 className="h-4 w-4" /> {t("crop.useOriginal")}
      </button>

      <div className="grid grid-cols-2 gap-3 px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-4">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={busy}
          className="h-12 border-white/15 bg-transparent"
        >
          {t("crop.retake")}
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={busy || !pixels}
          className="h-12 bg-gradient-burgundy text-cream"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> {t("scan.analyzing")}
            </>
          ) : (
            <>
              <Check className="h-4 w-4" /> {t("crop.use")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

async function getCroppedBlob(
  src: string,
  area: Area,
  rotation: number,
  mimeType: string,
): Promise<Blob> {
  const image = await loadImage(src);
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const bBoxW = Math.max(1, Math.round(image.width * cos + image.height * sin));
  const bBoxH = Math.max(1, Math.round(image.height * cos + image.width * sin));

  const canvas = document.createElement("canvas");
  canvas.width = bBoxW;
  canvas.height = bBoxH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.translate(bBoxW / 2, bBoxH / 2);
  ctx.rotate(rad);
  ctx.drawImage(image, -image.width / 2, -image.height / 2);

  const sx = Math.max(0, Math.round(area.x));
  const sy = Math.max(0, Math.round(area.y));
  const sw = Math.max(1, Math.min(Math.round(area.width), bBoxW - sx));
  const sh = Math.max(1, Math.min(Math.round(area.height), bBoxH - sy));

  // Downscale very large crops so the upload and the model request stay sane.
  const scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(sw, sh));
  const outW = Math.max(1, Math.round(sw * scale));
  const outH = Math.max(1, Math.round(sh * scale));

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("Canvas is not available");
  outCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, outW, outH);

  return new Promise((resolve, reject) => {
    out.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not read the photo"))),
      mimeType,
      0.92,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Could not load the photo"));
    img.crossOrigin = "anonymous";
    img.src = src;
  });
}
