import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { X, Loader2, Wine, Check, Type, Camera, Sparkles } from "lucide-react";
import { LiveCamera } from "@/components/LiveCamera";
import { Button } from "@/components/ui/button";
import { WineImage } from "@/components/WineImage";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useT } from "@/i18n";
import { logEvent } from "@/lib/analytics";
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

type Stage = "idle" | "analyzing" | "match" | "confirm";

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
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [scanned, setScanned] = useState<ScannedWine | null>(null);
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

  const persistWine = async (w: AnalyzedWine, imageUrl: string | null) => {
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
        ai_raw: w,
      } as never)
      .select("id,image_url,producer,wine_name,vintage,grape_varieties,region,country,wine_type")
      .single();
    if (insErr) throw insErr;
    return inserted as ScannedWine;
  };

  const applyResult = (
    result: SanitizedAnalysis,
    base: Omit<PendingMatch, "wine" | "partial" | "labelText" | "confidence">,
  ) => {
    setPendingMatch({
      ...base,
      wine: result.wine,
      partial: isUncertain(result),
      labelText: result.labelText,
      confidence: result.minConfidence,
    });
    setStage("confirm");
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
        body: { text: q },
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
        body: { imageBase64: base64, mimeType },
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
    if (!pendingMatch || !user || saving) return;
    setSaving(true);
    try {
      const inserted = await persistWine(pendingMatch.wine, pendingMatch.imageUrl);
      if (pendingMatch.storagePath && pendingMatch.imageUrl) {
        await supabase.from("wine_photos").insert({
          wine_id: inserted.id,
          user_id: user.id,
          url: pendingMatch.imageUrl,
          storage_path: pendingMatch.storagePath,
          kind: "label",
          sort_order: 0,
        });
      }
      logEvent("wine_scanned", {
        mode: pendingMatch.mode,
        wine_id: inserted.id,
        wine_type: inserted.wine_type,
        partial: pendingMatch.partial,
      });
      setScanned(inserted);
      setPendingMatch(null);
      setPreviewUrl(null);
      setStage("match");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : t("common.error"));
      setStage("confirm");
    } finally {
      setSaving(false);
    }
  };

  const discardPending = async () => {
    const pm = pendingMatch;
    setPendingMatch(null);
    setPreviewUrl(null);
    setStage("idle");
    if (pm?.storagePath) {
      await supabase.storage.from("wine-labels").remove([pm.storagePath]);
    }
  };

  if (stage === "confirm" && pendingMatch) {
    return (
      <ConfirmMatch
        wine={pendingMatch.wine}
        imageUrl={pendingMatch.previewUrl ?? pendingMatch.imageUrl}
        labelText={pendingMatch.labelText}
        mode={pendingMatch.mode}
        busy={saving}
        onSave={savePending}
        onDiscard={discardPending}
      />
    );
  }

  if (stage === "match" && scanned) {
    return (
      <MatchFound
        wine={scanned}
        onBack={() => {
          setStage("idle");
          setText("");
        }}
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
                <Loader2 className="h-5 w-5 animate-spin" /> Analyzing…
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" /> Identify wine
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

function ConfirmMatch({
  wine,
  imageUrl,
  labelText,
  mode,
  busy,
  onSave,
  onDiscard,
}: {
  wine: AnalyzedWine;
  imageUrl: string | null;
  labelText: string;
  mode: "camera" | "text";
  busy?: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const t = useT();
  const rows: [string, string][] = (
    [
      [t("scan.fieldProducer"), wine.producer],
      [t("scan.fieldName"), wine.wine_name],
      [t("scan.fieldVintage"), wine.vintage ? String(wine.vintage) : null],
      [t("scan.fieldRegion"), [wine.region, wine.country].filter(Boolean).join(", ") || null],
      [t("scan.fieldGrapes"), wine.grape_varieties?.join(", ") || null],
      [t("scan.fieldType"), wine.wine_type],
    ] as [string, string | null][]
  ).filter((r): r is [string, string] => Boolean(r[1]));

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background text-foreground"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <header className="flex shrink-0 items-center justify-between px-5 pt-4">
        <span className="h-9 w-9" />
        <p className="font-display text-base">{t("scan.result")}</p>
        <span className="h-9 w-9" />
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 py-6">
        <h1 className="text-center font-display text-2xl text-gold">{t("scan.reviewTitle")}</h1>
        <p className="mt-2 max-w-sm text-center text-base text-muted-foreground">
          {t("scan.reviewDesc")}
          {mode === "camera" && ` ${t("scan.reviewCheckLabel")}`}
        </p>

        <div className="mt-6 w-full max-w-sm rounded-2xl border border-white/8 bg-card/60 p-4 shadow-soft">
          <div className="flex h-56 w-full items-center justify-center overflow-hidden rounded-md bg-gradient-to-b from-burgundy/30 to-background/60">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={t("scan.imageAlt")}
                className="h-full w-full object-contain"
              />
            ) : (
              <Wine className="h-8 w-8 text-gold/60" />
            )}
          </div>

          <dl className="mt-4 space-y-1.5">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 text-base">
                <dt className="text-sm text-cream/80">{label}</dt>
                <dd className="min-w-0 break-words text-right text-cream">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-3 text-sm text-cream/80">{t("scan.unknownFields")}</p>
          <p className="mt-1 text-sm text-cream/80">{t("scan.tasteEstimate")}</p>

          {labelText.trim() && (
            <details className="mt-3">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm text-cream/80">
                {t("scan.labelRead")}
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-cream/70">
                {labelText.trim()}
              </pre>
            </details>
          )}
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-4">
        <Button
          variant="outline"
          onClick={onDiscard}
          disabled={busy}
          className="h-12 border-white/15 bg-transparent min-h-11"
        >
          {t("scan.discard")}
        </Button>
        <Button
          onClick={onSave}
          disabled={busy}
          className="h-12 bg-gradient-burgundy text-cream min-h-11"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}{" "}
          {t("scan.save")}
        </Button>
      </div>
    </div>
  );
}

function MatchFound({ wine, onBack }: { wine: ScannedWine; onBack: () => void }) {
  const navigate = useNavigate();
  const t = useT();
  const flag = countryToFlag(wine.country);
  const wineTypeLabel =
    (wine.wine_type ?? "Wine").charAt(0).toUpperCase() +
    (wine.wine_type ?? "wine").slice(1) +
    " Wine";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background text-foreground"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <header className="flex items-center justify-between px-5 pt-4">
        <button
          onClick={onBack}
          aria-label={t("common.back")}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 min-h-11 min-w-11"
        >
          <X className="h-5 w-5" />
        </button>
        <p className="font-display text-base">{t("scan.result")}</p>
        <span className="h-9 w-9" />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-success/20 blur-2xl" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-success bg-success/10 shadow-[0_0_40px_oklch(0.7_0.18_145/0.5)]">
            <Check className="h-12 w-12 text-success" strokeWidth={2.5} />
          </div>
        </div>

        <h1 className="mt-6 font-display text-3xl">{t("scan.matchFound")}</h1>
        <p className="mt-1 text-base text-muted-foreground">{t("scan.matchDesc")}</p>

        <div className="mt-8 flex w-full items-start gap-3 rounded-2xl border border-white/8 bg-card/60 p-4 shadow-soft">
          <div className="flex h-24 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-b from-burgundy/40 to-background/60">
            {wine.image_url ? (
              <WineImage src={wine.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <Wine className="h-7 w-7 text-gold/60" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg leading-tight text-cream">
              {wine.wine_name ?? "Unknown"} {wine.vintage ?? ""}
            </p>
            <p className="mt-0.5 truncate text-base text-gold">
              {[wine.region, wine.country].filter(Boolean).join(", ")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {flag && <span className="mr-1">{flag}</span>}
              {wineTypeLabel}
            </p>
            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-sm font-medium text-success">
              <Check className="h-3 w-3" /> {t("scan.savedToCellar")}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-4">
        <Button
          variant="outline"
          onClick={() => navigate({ to: "/wine/$id", params: { id: wine.id } })}
          className="h-12 border-white/15 bg-transparent min-h-11"
        >
          {t("scan.viewDetails")}
        </Button>
        <Button
          onClick={() => navigate({ to: "/cellar" })}
          className="h-12 bg-gradient-burgundy text-cream min-h-11"
        >
          <Wine className="h-5 w-5" /> {t("scan.saveToCellar")}
        </Button>
      </div>
    </div>
  );
}

function countryToFlag(country: string | null | undefined): string | null {
  if (!country) return null;
  const map: Record<string, string> = {
    france: "🇫🇷",
    frankrike: "🇫🇷",
    italy: "🇮🇹",
    italien: "🇮🇹",
    spain: "🇪🇸",
    spanien: "🇪🇸",
    portugal: "🇵🇹",
    germany: "🇩🇪",
    tyskland: "🇩🇪",
    austria: "🇦🇹",
    österrike: "🇦🇹",
    usa: "🇺🇸",
    "united states": "🇺🇸",
    chile: "🇨🇱",
    argentina: "🇦🇷",
    australia: "🇦🇺",
    australien: "🇦🇺",
    "new zealand": "🇳🇿",
    nyazeeland: "🇳🇿",
    "south africa": "🇿🇦",
    sydafrika: "🇿🇦",
    sweden: "🇸🇪",
    sverige: "🇸🇪",
    greece: "🇬🇷",
    grekland: "🇬🇷",
    hungary: "🇭🇺",
    ungern: "🇭🇺",
  };
  return map[country.trim().toLowerCase()] ?? null;
}
