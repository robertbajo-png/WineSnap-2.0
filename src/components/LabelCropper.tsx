import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { RotateCw, RotateCcw, X, Check, Loader2 } from "lucide-react";
import { useT } from "@/i18n";

type Props = {
  file: File;
  onCancel: () => void;
  onConfirm: (croppedBlob: Blob) => void | Promise<void>;
  busy?: boolean;
};

export function LabelCropper({ file, onCancel, onConfirm, busy }: Props) {
  const t = useT();
  const [imageSrc] = useState(() => URL.createObjectURL(file));
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pixels, setPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, areaPx: Area) => setPixels(areaPx), []);

  const handleConfirm = async () => {
    if (!pixels) return;
    const blob = await getCroppedBlob(imageSrc, pixels, rotation);
    URL.revokeObjectURL(imageSrc);
    await onConfirm(blob);
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-cream" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <header className="flex items-center justify-between px-4 pt-3">
        <button onClick={onCancel} aria-label="Cancel" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
          <X className="h-4 w-4" />
        </button>
        <p className="text-sm text-cream/80">{t("crop.adjust")}</p>
        <span className="h-9 w-9" />
      </header>

      <div className="relative flex-1">
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

      <div className="grid grid-cols-2 gap-3 px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-4">
        <Button variant="outline" onClick={onCancel} disabled={busy} className="h-12 border-white/15 bg-transparent">
          {t("crop.retake")}
        </Button>
        <Button onClick={handleConfirm} disabled={busy || !pixels} className="h-12 bg-gradient-burgundy text-cream">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("scan.analyzing")}</> : <><Check className="h-4 w-4" /> {t("crop.use")}</>}
        </Button>
      </div>
    </div>
  );
}

async function getCroppedBlob(src: string, area: Area, rotation: number): Promise<Blob> {
  const image = await loadImage(src);
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const bBoxW = image.width * cos + image.height * sin;
  const bBoxH = image.width * sin + image.height * cos;

  const canvas = document.createElement("canvas");
  canvas.width = bBoxW;
  canvas.height = bBoxH;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(bBoxW / 2, bBoxH / 2);
  ctx.rotate(rad);
  ctx.drawImage(image, -image.width / 2, -image.height / 2);

  const data = ctx.getImageData(area.x, area.y, area.width, area.height);
  canvas.width = area.width;
  canvas.height = area.height;
  ctx.putImageData(data, 0, 0);

  return new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.92));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.crossOrigin = "anonymous";
    img.src = src;
  });
}
