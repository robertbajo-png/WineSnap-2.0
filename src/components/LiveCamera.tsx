import { useEffect, useRef, useState } from "react";
import { Camera, ImageIcon, Loader2, RotateCcw } from "lucide-react";
import { useT } from "@/i18n";
import { cameraErrorKey, captureCamera, requestCamera } from "@/lib/liveCamera";

export function LiveCamera({
  onCapture,
  onGallery,
  analyzing = false,
}: {
  onCapture: (file: File) => void;
  onGallery: () => void;
  analyzing?: boolean;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureBusy = useRef(false);
  const session = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(() => typeof document !== "undefined" && !document.hidden);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<
    ReturnType<typeof cameraErrorKey> | "scan.cameraUnsupported" | null
  >(null);

  useEffect(() => {
    const changed = () => setVisible(!document.hidden);
    changed();
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);

  useEffect(() => {
    const id = ++session.current;
    const video = videoRef.current;
    setReady(false);
    setCapturing(false);
    setError(null);
    if (!visible || !video || analyzing) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("scan.cameraUnsupported");
      return;
    }
    let release = () => {};
    const fail = (reason: unknown) => {
      if (session.current === id) {
        release();
        video.srcObject = null;
        setReady(false);
        setError(cameraErrorKey(reason));
      }
    };
    const removers: (() => void)[] = [];
    const stop = requestCamera(
      navigator.mediaDevices,
      (stream) => {
        video.srcObject = stream;
        for (const track of stream.getVideoTracks()) {
          const ended = () => fail(new Error("Camera disconnected"));
          track.addEventListener("ended", ended);
          removers.push(() => track.removeEventListener("ended", ended));
        }
        void video.play().catch(fail);
      },
      fail,
    );
    release = stop;
    return () => {
      session.current = id + 1;
      removers.forEach((remove) => remove());
      stop();
      video.pause();
      video.srcObject = null;
    };
  }, [attempt, visible, analyzing]);

  const takePhoto = async () => {
    if (analyzing || !ready || error || captureBusy.current || !videoRef.current) return;
    captureBusy.current = true;
    setCapturing(true);
    const id = session.current;
    try {
      const file = await captureCamera(videoRef.current);
      if (session.current === id) onCapture(file);
    } catch (reason) {
      if (session.current === id) setError(cameraErrorKey(reason));
    } finally {
      captureBusy.current = false;
      if (session.current === id) setCapturing(false);
    }
  };

  return (
    <>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,oklch(0.22_0.02_30)_0%,oklch(0.08_0.005_30)_70%)]"
        />
        <div className="absolute inset-8 overflow-hidden rounded-2xl">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            aria-label={t("scan.cameraPreview")}
            onLoadedData={() => setReady(true)}
            onPlaying={() => setReady(true)}
            className={`h-full w-full object-cover object-center ${ready && !error ? "" : "invisible"}`}
          />
        </div>
        {analyzing ? (
          <div className="absolute inset-0 flex items-center justify-center" role="status">
            <div className="flex flex-col items-center gap-3 text-gold">
              <Loader2 className="h-12 w-12 animate-spin" />
              <p className="font-display text-lg">{t("scan.analyzing")}</p>
            </div>
          </div>
        ) : (
          (!ready || error) && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center"
              role="status"
            >
              {error ? (
                <Camera className="h-9 w-9 text-muted-foreground" />
              ) : (
                <Loader2 className="h-9 w-9 animate-spin text-gold" />
              )}
              <p className="max-w-sm text-sm text-cream">{t(error ?? "scan.cameraStarting")}</p>
              {error && (
                <button
                  onClick={() => setAttempt((value) => value + 1)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gold"
                >
                  <RotateCcw className="h-4 w-4" />
                  {t("scan.cameraRetry")}
                </button>
              )}
            </div>
          )
        )}
        <div aria-hidden className="pointer-events-none">
          <div className="absolute h-12 w-12 border-cream/85 left-8 top-8 border-l-2 border-t-2 rounded-tl-2xl" />
          <div className="absolute h-12 w-12 border-cream/85 right-8 top-8 border-r-2 border-t-2 rounded-tr-2xl" />
          <div className="absolute h-12 w-12 border-cream/85 left-8 bottom-8 border-l-2 border-b-2 rounded-bl-2xl" />
          <div className="absolute h-12 w-12 border-cream/85 right-8 bottom-8 border-r-2 border-b-2 rounded-br-2xl" />
        </div>
        <p className="absolute inset-x-0 bottom-6 text-center text-xs text-cream/70">
          {t("scan.align")}
        </p>
      </div>
      <div className="flex shrink-0 items-center justify-center gap-12 px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-6">
        <button
          onClick={onGallery}
          disabled={analyzing}
          aria-label={t("scan.gallery")}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-40"
        >
          <ImageIcon className="h-5 w-5" />
        </button>
        <button
          onClick={() => void takePhoto()}
          disabled={analyzing || !visible || !ready || Boolean(error) || capturing}
          aria-label={t("scan.takePhoto")}
          className="relative flex h-20 w-20 items-center justify-center rounded-full ring-2 ring-gold transition-transform active:scale-95 disabled:opacity-60"
        >
          <span className="absolute inset-1.5 rounded-full bg-cream" />
          {(capturing || analyzing) && (
            <Loader2 className="absolute inset-0 m-auto h-8 w-8 animate-spin text-burgundy" />
          )}
        </button>
        <span className="h-12 w-12" />
      </div>
    </>
  );
}
