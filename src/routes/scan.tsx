import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { X, Loader2, Type, Camera, Sparkles } from "lucide-react";
import { LiveCamera } from "@/components/LiveCamera";
import { Button } from "@/components/ui/button";
import { ScanResult } from "@/components/ScanResult";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useT, useI18n } from "@/i18n";
import { logEvent } from "@/lib/analytics";
import { createSaveGuard } from "@/lib/tastingNotes";
import {
  checkImageInput,
  createAttemptGuard,
  extensionForMime,
  isUncertain,
  sanitizeAnalysis,
  type AnalyzedWine,
  type SanitizedAnalysis,
} from "@/lib/scanIdentity";
const LabelCropper = lazy(() =>
  import("@/components/LabelCropper").then((m) => ({ default: m.LabelCropper })),
);

export const Route = createFileRoute("/scan")({
  head: () => ({ meta: [{ title: "Scan — WineSnap" }] }),
  component: ScanPage,
});

type Stage = "idle" | "analyzing" | "result";

type PendingMatch = {
  wine: AnalyzedWine;
  /** Local preview of exactly the image we submitted (no public storage needed). */
  previewUrl: string | null;
  imageUrl: string | null;
  storagePath: string | null;
  mode: "camera" | "text";
  partial: boolean;
  labelText: string;
  confidence: number;
  originalWine: AnalyzedWine;
  edited: boolean;
};

type ScannedWine = {
  id: string;
  image_url: string | null;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  grape_varieties: string[] | null;
  region: string | null;
  country: string | null;
  wine_type: string | null;
};

function ScanPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const { lang } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [savedId, setSavedId] = useState<string | null>(null);
  const savedIdRef = useRef<string | null>(null);
  const saveGuardRef = useRef(createSaveGuard());
  const [mode, setMode] = useState<"camera" | "text">("camera");
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingMatch, setPendingMatch] = useState<PendingMatch | null>(null);
  const [saving, setSaving] = useState(false);

  // One guard for the whole page: every analysis attempt gets an id, and a late
  // response from an abandoned attempt is dropped instead of overwriting state.
  const guardRef = useRef(createAttemptGuard());
  const previewUrlRef = useRef<string | null>(null);

  const setPreviewUrl = (url: string | null) => {
    if (previewUrlRef.current && previewUrlRef.current !== url) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = url;
  };

  useEffect(() => {
    const guard = guardRef.current;
    return () => {
      guard.cancel();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      toast.info(t("scan.signInInfo"));
      navigate({ to: "/login" });
    }
  }, [user, loading, navigate, t]);

  const persistWine = async (
    w: AnalyzedWine,
    imageUrl: string | null,
    originalWine: AnalyzedWine,
  ) => {
    if (!user) throw new Error("Not authenticated");
    const { data: inserted, error: insErr } = await supabase
      .from("wines")
      .insert({
        user_id: user.id,
        image_url: imageUrl,
        producer: w.producer,
        wine_name: w.wine_name,
        vintage: w.vintage,
        grape_varieties: w.grape_varieties,
        region: w.region,
        country: w.country,
        wine_type: w.wine_type,
        description: w.description,
        fruit: w.fruit,
        tannin: w.tannin,
        acidity: w.acidity,
        oak: w.oak,
        sweetness: w.sweetness,
        body: w.body,
        primary_notes: w.primary_notes,
        secondary_notes: w.secondary_notes,
        tertiary_notes: w.tertiary_notes,
        food_pairings: w.food_pairings,
        serving_temp: w.serving_temp,
        glass_type: w.glass_type,
        decant: w.decant,
        ai_raw: originalWine,
      } as never)
      .select("id,image_url,producer,wine_name,vintage,grape_varieties,region,country,wine_type")
      .single();
    if (insErr) throw insErr;
    return inserted as ScannedWine;
  };

  const applyResult = (
    result: SanitizedAnalysis,
    base: Omit<
      PendingMatch,
      "wine" | "partial" | "labelText" | "confidence" | "originalWine" | "edited"
    >,
  ) => {
    setPendingMatch({
      ...base,
      wine: result.wine,
      partial: isUncertain(result),
      labelText: result.labelText,
      confidence: result.minConfidence,
      originalWine: result.wine,
      edited: false,
    });
    setSavedId(null);
    savedIdRef.current = null;
    setStage("result");
  };

  const handleText = async () => {
    if (!user) return;
    const guard = guardRef.current;
    if (guard.isBusy()) return;
    const q = text.trim();
    if (q.length < 3) {
      toast.error(t("scan.describeError"));
      return;
    }
    const attempt = guard.start();
    setStage("analyzing");
    try {
      const { data, error } = await supabase.functions.invoke("analyze-wine", {
        body: { text: q, language: lang },
      });
      if (!guard.isCurrent(attempt)) return;
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const result = sanitizeAnalysis(data?.wine, q);
      if (!result.identified) throw new Error(t("scan.notIdentified"));
      applyResult(result, {
        previewUrl: null,
        imageUrl: null,
        storagePath: null,
        mode: "text",
      });
    } catch (e) {
      if (!guard.isCurrent(attempt)) return;
      console.error(e);
      toast.error(e instanceof Error ? e.message : t("common.error"));
      setStage("idle");
    } finally {
      guard.finish(attempt);
    }
  };

  const handleFile = async (image: Blob, mimeTypeHint: string) => {
    if (!user) return;
    const guard = guardRef.current;
    if (guard.isBusy()) return;

    const check = checkImageInput({ type: mimeTypeHint || image.type, size: image.size });
    if (!check.ok) {
      toast.error(
        t(
          check.reason === "size"
            ? "scan.imageTooLarge"
            : check.reason === "type"
              ? "scan.imageType"
              : "scan.imageError",
        ),
      );
      setStage("idle");
      return;
    }
    const mimeType = check.mimeType;

    const attempt = guard.start();
    setStage("analyzing");
    // Show exactly the bytes we submit, straight from the device.
    setPreviewUrl(URL.createObjectURL(image));
    const localPreview = previewUrlRef.current;

    let path: string | null = null;
    try {
      path = `${user.id}/${crypto.randomUUID()}.${extensionForMime(mimeType)}`;
      const { error: upErr } = await supabase.storage
        .from("wine-labels")
        .upload(path, image, { contentType: mimeType, cacheControl: "0" });
      if (!guard.isCurrent(attempt)) {
        await supabase.storage.from("wine-labels").remove([path]);
        return;
      }
      if (upErr) throw upErr;
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => {
          const s = r.result as string;
          const payload = s.split(",")[1];
          if (!payload) rej(new Error(t("scan.imageError")));
          else res(payload);
        };
        r.onerror = () => rej(new Error(t("scan.imageError")));
        r.readAsDataURL(image);
      });
      if (!guard.isCurrent(attempt)) {
        await supabase.storage.from("wine-labels").remove([path]);
        return;
      }

      const { data, error } = await supabase.functions.invoke("analyze-wine", {
        body: { imageBase64: base64, mimeType, language: lang },
      });
      if (!guard.isCurrent(attempt)) {
        await supabase.storage.from("wine-labels").remove([path]);
        return;
      }
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const result = sanitizeAnalysis(data?.wine);
      if (!result.identified) {
        await supabase.storage.from("wine-labels").remove([path]);
        path = null;
        throw new Error(t("scan.notIdentified"));
      }
      applyResult(result, {
        previewUrl: localPreview,
        imageUrl: path,
        storagePath: path,
        mode: "camera",
      });
    } catch (e) {
      if (!guard.isCurrent(attempt)) return;
      console.error(e);
      if (path) await supabase.storage.from("wine-labels").remove([path]);
      setPreviewUrl(null);
      toast.error(e instanceof Error ? e.message : t("common.error"));
      setStage("idle");
    } finally {
      guard.finish(attempt);
    }
  };

  const savePending = async () => {
    if (!pendingMatch || !user || savedIdRef.current || !saveGuardRef.current.tryStart()) return;
    setSaving(true);
    try {
      const inserted = await persistWine(
        pendingMatch.wine,
        pendingMatch.imageUrl,
        pendingMatch.originalWine,
      );
      savedIdRef.current = inserted.id;
      setSavedId(inserted.id);
      if (pendingMatch.storagePath && pendingMatch.imageUrl) {
        const { error: photoError } = await supabase.from("wine_photos").insert({
          wine_id: inserted.id,
          user_id: user.id,
          url: pendingMatch.imageUrl,
          storage_path: pendingMatch.storagePath,
          kind: "label",
          sort_order: 0,
        });
        if (photoError) toast.warning(t("scan.photoWarning"));
      }
      logEvent("wine_scanned", {
        mode: pendingMatch.mode,
        wine_id: inserted.id,
        wine_type: inserted.wine_type,
        partial: pendingMatch.partial,
      });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSaving(false);
      saveGuardRef.current.finish();
    }
  };

  const discardPending = async () => {
    if (saving || savedIdRef.current) return;
    const pm = pendingMatch;
    setPendingMatch(null);
    setPreviewUrl(null);
    setStage("idle");
    if (pm?.storagePath) {
      await supabase.storage.from("wine-labels").remove([pm.storagePath]);
    }
  };

  if (stage === "result" && pendingMatch) {
    return (
      <ScanResult
        wine={pendingMatch.wine}
        imageUrl={pendingMatch.previewUrl ?? pendingMatch.imageUrl}
        labelText={pendingMatch.labelText}
        mode={pendingMatch.mode}
        partial={pendingMatch.partial}
        edited={pendingMatch.edited}
        saved={savedId !== null}
        busy={saving}
        onEdit={(wine) =>
          setPendingMatch((current) => (current ? { ...current, wine, edited: true } : current))
        }
        onSave={savePending}
        onClose={discardPending}
        onDetails={() => {
          if (savedId) navigate({ to: "/wine/$id", params: { id: savedId } });
        }}
        onCellar={() => navigate({ to: "/cellar" })}
      />
    );
  }

  if (pendingFile) {
    return (
      <Suspense fallback={null}>
        <LabelCropper
          file={pendingFile}
          busy={stage === "analyzing"}
          onCancel={() => {
            guardRef.current.cancel();
            setPendingFile(null);
            setStage("idle");
          }}
          onError={() => toast.error(t("scan.imageError"))}
          onConfirm={async (image, meta) => {
            setPendingFile(null);
            await handleFile(image, meta.mimeType);
          }}
        />
      </Suspense>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background text-foreground"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 pt-4">
        <button
          onClick={() => navigate({ to: "/" })}
          aria-label={t("scan.close")}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 min-h-11 min-w-11"
        >
          <X className="h-5 w-5" />
        </button>
        <p className="text-base text-cream/85">
          {mode === "camera" ? t("scan.positionLabel") : t("scan.describeWine")}
        </p>
        <span className="h-9 w-9" />
      </header>

      {/* Mode toggle */}
      <div className="px-5 pt-4">
        <div className="mx-auto flex w-full max-w-xs items-center rounded-full border border-white/10 bg-white/5 p-1">
          <button
            onClick={() => setMode("camera")}
            aria-pressed={mode === "camera"}
            disabled={stage === "analyzing"}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-base transition  min-h-11 min-w-11 ${
              mode === "camera"
                ? "bg-gradient-burgundy text-cream shadow-soft"
                : "text-cream/70 hover:text-cream"
            }`}
          >
            <Camera className="h-5 w-5" /> {t("scan.scan")}
          </button>
          <button
            onClick={() => setMode("text")}
            aria-pressed={mode === "text"}
            disabled={stage === "analyzing"}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-base transition  min-h-11 min-w-11 ${
              mode === "text"
                ? "bg-gradient-burgundy text-cream shadow-soft"
                : "text-cream/70 hover:text-cream"
            }`}
          >
            <Type className="h-5 w-5" /> {t("scan.type")}
          </button>
        </div>
      </div>

      {mode === "camera" ? (
        user && !loading ? (
          <LiveCamera
            onCapture={setPendingFile}
            onGallery={() => fileRef.current?.click()}
            analyzing={stage === "analyzing"}
          />
        ) : (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-3 text-gold"
            role="status"
          >
            <Loader2 className="h-12 w-12 animate-spin" />
            <p>{stage === "analyzing" ? t("scan.analyzing") : t("scan.cameraStarting")}</p>
          </div>
        )
      ) : (
        <div className="flex flex-1 flex-col px-5 pt-6 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
          <div className="flex flex-1 flex-col">
            <label
              htmlFor="scan-description"
              className="mb-2 text-sm uppercase tracking-wider text-cream/90"
            >
              {t("scan.descLabel")}
            </label>
            <Textarea
              id="scan-description"
              aria-describedby="scan-description-hint"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={stage === "analyzing"}
              placeholder={t("scan.descPh")}
              className="min-h-[180px] resize-none border-white/10 bg-white/5 text-base text-cream placeholder:text-cream/80 focus-visible:ring-gold/40"
            />
            <p id="scan-description-hint" className="mt-2 text-sm text-cream/80">
              {t("scan.descHint")}
            </p>
          </div>

          <Button
            onClick={handleText}
            disabled={stage === "analyzing" || text.trim().length < 3}
            className="mt-6 h-14 bg-gradient-burgundy text-cream shadow-soft min-h-11"
          >
            {stage === "analyzing" ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> {t("scan.analyzing")}
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" /> {t("scan.identify")}
              </>
            )}
          </Button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setPendingFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
