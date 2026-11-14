import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Trash2, X, Loader2, Wine } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/i18n";
import { WineImage } from "./WineImage";
import { OperationNotice } from "./OperationNotice";
import {
  createPhotoSaveAttempt,
  loadWinePhotos,
  removeWinePhoto,
  saveWinePhoto,
  type PhotoSaveAttempt,
  type WinePhoto,
} from "@/lib/winePhotos";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTitle } from "./ui/dialog";
const LabelCropper = lazy(() =>
  import("./LabelCropper").then((m) => ({ default: m.LabelCropper })),
);

type Props = {
  wineId: string;
  fallbackUrl?: string | null;
  editable?: boolean;
};

export function PhotoGallery({ wineId, fallbackUrl, editable = false }: Props) {
  const { user } = useAuth();
  return (
    <PhotoGallerySession
      key={`${wineId}:${user?.id ?? "guest"}:${editable}`}
      wineId={wineId}
      fallbackUrl={fallbackUrl}
      editable={editable}
      owner={user?.id}
    />
  );
}

function PhotoGallerySession({ wineId, fallbackUrl, editable, owner }: Props & { owner?: string }) {
  const t = useT();
  const [photos, setPhotos] = useState<WinePhoto[]>([]);
  const [readState, setReadState] = useState<"loading" | "ready" | "error" | "offline">("loading");
  const [pending, setPending] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saveAttempt, setSaveAttempt] = useState<PhotoSaveAttempt | null>(null);
  const [deleteAttempt, setDeleteAttempt] = useState<WinePhoto | null>(null);
  const alive = useRef(true),
    readGeneration = useRef(0),
    mutationGeneration = useRef(0),
    working = useRef(false);
  const [lightbox, setLightbox] = useState<{ url: string; storagePath: string | null } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const lightboxTriggerRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    const generation = ++readGeneration.current;
    setPhotos([]);
    if (!navigator.onLine) {
      setReadState("offline");
      return;
    }
    setReadState("loading");
    try {
      const rows = await loadWinePhotos(wineId);
      if (alive.current && generation === readGeneration.current) {
        setPhotos(rows);
        setReadState("ready");
      }
    } catch {
      if (alive.current && generation === readGeneration.current) setReadState("error");
    }
  }, [wineId]);

  useEffect(() => {
    alive.current = true;
    void load();
    const invalidate = () => {
      ++readGeneration.current;
      ++mutationGeneration.current;
    };
    const offline = () => {
      invalidate();
      setPhotos([]);
      setLightbox(null);
      setReadState("offline");
    };
    const online = () => {
      void load();
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      alive.current = false;
      invalidate();
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, [load]);

  const locked = uploading || Boolean(saveAttempt || deleteAttempt) || readState !== "ready";

  const onFile = (f: File | null) => {
    if (editable && owner && !locked && f) setPending(f);
  };

  const save = async (attempt: PhotoSaveAttempt) => {
    if (!editable || !owner || working.current || !navigator.onLine) return;
    const generation = mutationGeneration.current;
    const scope = {
      owner,
      current: () => alive.current && generation === mutationGeneration.current,
    };
    working.current = true;
    setUploading(true);
    try {
      await saveWinePhoto(attempt, scope);
      if (!scope.current()) return;
      setSaveAttempt(null);
      toast.success(t("photos.add"));
      await load();
    } catch {
      if (scope.current()) toast.error(t("photos.saveUnconfirmed"));
    } finally {
      working.current = false;
      if (alive.current) setUploading(false);
    }
  };

  const uploadCropped = async (blob: Blob) => {
    if (!editable || !owner || working.current || saveAttempt || deleteAttempt) return;
    try {
      const attempt = createPhotoSaveAttempt(
        owner,
        wineId,
        blob,
        Math.min(2147483647, (photos.at(-1)?.sort_order ?? 0) + 1),
      );
      setSaveAttempt(attempt);
      setPending(null);
      await save(attempt);
    } catch {
      toast.error(t("photos.invalidImage"));
    }
  };

  const remove = async (photo: WinePhoto, retry = false) => {
    if (!editable || !owner || working.current || !navigator.onLine || (!retry && locked)) return;
    if (!retry && !confirm(t("photos.deleteConfirm"))) return;
    const generation = mutationGeneration.current;
    const scope = {
      owner,
      current: () => alive.current && generation === mutationGeneration.current,
    };
    setDeleteAttempt(photo);
    working.current = true;
    setUploading(true);
    try {
      const result = await removeWinePhoto(photo, scope);
      if (!scope.current()) return;
      setDeleteAttempt(null);
      setLightbox(null);
      toast.success(t(result === "retained" ? "photos.removedRetained" : "photos.removed"));
      await load();
    } catch {
      if (scope.current()) toast.error(t("photos.deleteUnconfirmed"));
    } finally {
      working.current = false;
      if (alive.current) setUploading(false);
    }
  };

  const combined: Array<{
    id: string;
    url: string;
    storagePath: string | null;
    kind: string;
    photo?: WinePhoto;
  }> = [];
  if ((!photos || photos.length === 0) && fallbackUrl) {
    combined.push({ id: "__fallback", url: fallbackUrl, storagePath: null, kind: "label" });
  }
  (photos ?? []).forEach((p) =>
    combined.push({
      id: p.id,
      url: p.url,
      storagePath: p.storage_path,
      kind: p.kind,
      photo: p,
    }),
  );

  return (
    <>
      {readState !== "ready" && (
        <OperationNotice
          kind={readState === "loading" ? "loading" : readState === "offline" ? "offline" : "error"}
          action={
            readState !== "loading"
              ? {
                  label: t("common.retry"),
                  onClick: () => {
                    void load();
                  },
                  disabled: readState === "offline",
                }
              : undefined
          }
        >
          {t(
            readState === "loading"
              ? "photos.loading"
              : readState === "offline"
                ? "photos.offline"
                : "photos.loadFailed",
          )}
        </OperationNotice>
      )}
      {uploading && <OperationNotice kind="loading">{t("state.saving")}</OperationNotice>}
      {saveAttempt && !uploading && (
        <OperationNotice
          kind="pending"
          action={{
            label: t("common.retry"),
            onClick: () => {
              void save(saveAttempt);
            },
            disabled: readState === "offline",
          }}
        >
          {t("photos.saveUnconfirmed")}
        </OperationNotice>
      )}
      {deleteAttempt && !uploading && (
        <OperationNotice
          kind="pending"
          action={{
            label: t("common.retry"),
            onClick: () => {
              void remove(deleteAttempt, true);
            },
            disabled: readState === "offline",
          }}
        >
          {t("photos.deleteUnconfirmed")}
        </OperationNotice>
      )}
      <div className="grid grid-cols-3 gap-2">
        {combined.map((c) => (
          <div
            key={c.id}
            className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-white/8 bg-white/5"
          >
            <button
              type="button"
              aria-label={t("photos.view")}
              onClick={(event) => {
                lightboxTriggerRef.current = event.currentTarget;
                setLightbox({ url: c.url, storagePath: c.storagePath });
              }}
              className="absolute inset-0 min-h-11 min-w-11"
            >
              <WineImage
                src={c.url}
                storagePath={c.storagePath}
                alt=""
                className="h-full w-full object-contain"
                loading="lazy"
              />
            </button>
            <span className="pointer-events-none absolute bottom-1 left-1 rounded-full bg-black/55 px-1.5 py-0.5 text-xs font-display uppercase tracking-wide text-cream/85">
              {t(`photos.kind.${c.kind}` as never) || c.kind}
            </span>
            {editable && owner && c.photo && (
              <button
                type="button"
                onClick={() => remove(c.photo!)}
                disabled={locked}
                aria-label={t("photos.delete")}
                className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
          </div>
        ))}
        {editable && owner && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={locked}
            className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 bg-white/[0.02] text-sm text-cream/90 hover:border-gold/40 hover:text-gold disabled:opacity-50 min-h-11 min-w-11"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Plus className="h-5 w-5" />
            )}
            <span>{uploading ? t("photos.uploading") : t("photos.add")}</span>
          </button>
        )}
      </div>

      {readState === "ready" && combined.length === 0 && !uploading && (
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Wine className="h-3.5 w-3.5" /> {t("photos.empty")}
        </div>
      )}

      {editable && owner && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      )}

      {pending && (
        <Suspense fallback={null}>
          <LabelCropper
            file={pending}
            busy={uploading}
            onCancel={() => setPending(null)}
            onConfirm={uploadCropped}
          />
        </Suspense>
      )}

      <Dialog open={lightbox !== null} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogPortal>
          <DialogOverlay className="bg-black/95" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-0 z-[60] flex h-dvh w-full items-center justify-center p-4 outline-none"
            style={{
              paddingTop: "max(4rem, env(safe-area-inset-top))",
              paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
            }}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setLightbox(null);
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (lightboxTriggerRef.current?.isConnected) lightboxTriggerRef.current.focus();
            }}
          >
            <DialogTitle className="sr-only">{t("photos.image")}</DialogTitle>
            <DialogClose
              aria-label={t("common.close")}
              className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-cream hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-gold"
            >
              <X className="h-5 w-5" />
            </DialogClose>
            {lightbox && (
              <WineImage
                src={lightbox.url}
                storagePath={lightbox.storagePath}
                alt={t("photos.image")}
                className="h-full min-h-0 w-full object-contain"
              />
            )}
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    </>
  );
}
