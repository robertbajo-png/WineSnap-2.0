import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Trash2, X, Loader2, Wine } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/i18n";
import { LabelCropper } from "./LabelCropper";

type Photo = {
  id: string;
  url: string;
  storage_path: string | null;
  kind: string;
  sort_order: number;
};

type Props = {
  wineId: string;
  fallbackUrl?: string | null;
};

export function PhotoGallery({ wineId, fallbackUrl }: Props) {
  const t = useT();
  const { user } = useAuth();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await supabase
      .from("wine_photos")
      .select("id,url,storage_path,kind,sort_order")
      .eq("wine_id", wineId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setPhotos((data as Photo[]) ?? []);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [wineId]);

  const onFile = (f: File | null) => { if (f) setPending(f); };

  const uploadCropped = async (blob: Blob) => {
    if (!user) return;
    setUploading(true);
    try {
      const path = `${user.id}/${wineId}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage.from("wine-labels").upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("wine-labels").getPublicUrl(path);
      const nextOrder = (photos?.[photos.length - 1]?.sort_order ?? 0) + 1;
      const { error: insErr } = await supabase.from("wine_photos").insert({
        wine_id: wineId,
        user_id: user.id,
        url: pub.publicUrl,
        storage_path: path,
        kind: "bottle",
        sort_order: nextOrder,
      });
      if (insErr) throw insErr;
      toast.success(t("photos.add"));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setUploading(false);
      setPending(null);
    }
  };

  const remove = async (p: Photo) => {
    if (!confirm(t("photos.deleteConfirm"))) return;
    if (p.storage_path) {
      await supabase.storage.from("wine-labels").remove([p.storage_path]);
    }
    await supabase.from("wine_photos").delete().eq("id", p.id);
    await load();
  };

  const combined: Array<{ id: string; url: string; kind: string; photo?: Photo }> = [];
  if ((!photos || photos.length === 0) && fallbackUrl) {
    combined.push({ id: "__fallback", url: fallbackUrl, kind: "label" });
  }
  (photos ?? []).forEach((p) => combined.push({ id: p.id, url: p.url, kind: p.kind, photo: p }));

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {combined.map((c) => (
          <div key={c.id} className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-white/8 bg-white/5">
            <button type="button" onClick={() => setLightbox(c.url)} className="absolute inset-0">
              <img src={c.url} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
            <span className="pointer-events-none absolute bottom-1 left-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-display uppercase tracking-wide text-cream/85">
              {t(`photos.kind.${c.kind}` as never) || c.kind}
            </span>
            {c.photo && (
              <button
                type="button"
                onClick={() => remove(c.photo!)}
                aria-label={t("photos.delete")}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 bg-white/[0.02] text-xs text-cream/60 hover:border-gold/40 hover:text-gold disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
          <span>{uploading ? t("photos.uploading") : t("photos.add")}</span>
        </button>
      </div>

      {combined.length === 0 && !uploading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Wine className="h-3.5 w-3.5" /> {t("photos.empty")}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.target.value = ""; }}
      />

      {pending && (
        <LabelCropper
          file={pending}
          busy={uploading}
          onCancel={() => setPending(null)}
          onConfirm={uploadCropped}
        />
      )}

      {lightbox && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setLightbox(null)}
          onKeyDown={(e) => { if (e.key === "Escape") setLightbox(null); }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
        >
          <button
            aria-label="Close"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-cream hover:bg-white/20"
            onClick={() => setLightbox(null)}
          >
            <X className="h-5 w-5" />
          </button>
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
        </div>
      )}
    </>
  );
}
