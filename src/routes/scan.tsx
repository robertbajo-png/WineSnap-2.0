import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { X, ImageIcon, Loader2, Wine, Check, Type, Camera, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useT } from "@/i18n";
import { logEvent } from "@/lib/analytics";
import { LabelCropper } from "@/components/LabelCropper";

export const Route = createFileRoute("/scan")({
  head: () => ({ meta: [{ title: "Scan — WineSnap" }] }),
  component: ScanPage,
});

type Stage = "idle" | "analyzing" | "match";

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
  const cameraRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [scanned, setScanned] = useState<ScannedWine | null>(null);
  const [mode, setMode] = useState<"camera" | "text">("camera");
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      toast.info(t("scan.signInInfo"));
      navigate({ to: "/login" });
    }
  }, [user, loading, navigate, t]);

  const persistWine = async (w: any, imageUrl: string | null) => {
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
      })
      .select("id,image_url,producer,wine_name,vintage,grape_varieties,region,country,wine_type")
      .single();
    if (insErr) throw insErr;
    return inserted as ScannedWine;
  };

  const handleText = async () => {
    if (!user) return;
    const q = text.trim();
    if (q.length < 3) {
      toast.error(t("scan.describeError"));
      return;
    }
    setStage("analyzing");
    try {
      const { data, error } = await supabase.functions.invoke("analyze-wine", { body: { text: q } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const inserted = await persistWine(data.wine, null);
      logEvent("wine_scanned", { mode: "text", wine_id: inserted.id, wine_type: inserted.wine_type });
      setScanned(inserted);
      setStage("match");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : t("common.error"));
      setStage("idle");
    }
  };

  const handleFile = async (file: File | Blob) => {
    if (!user) return;
    setStage("analyzing");
    try {
      const path = `${user.id}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage.from("wine-labels").upload(path, file, {
        contentType: "image/jpeg",
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("wine-labels").getPublicUrl(path);

      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => {
          const s = r.result as string;
          res(s.split(",")[1]);
        };
        r.onerror = rej;
        r.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("analyze-wine", {
        body: { imageBase64: base64, mimeType: "image/jpeg" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const inserted = await persistWine(data.wine, pub.publicUrl);
      // Also register the label in wine_photos
      await supabase.from("wine_photos").insert({
        wine_id: inserted.id,
        user_id: user.id,
        url: pub.publicUrl,
        storage_path: path,
        kind: "label",
        sort_order: 0,
      });
      logEvent("wine_scanned", { mode: "camera", wine_id: inserted.id, wine_type: inserted.wine_type });
      setScanned(inserted);
      setStage("match");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : t("common.error"));
      setStage("idle");
    }
  };

  if (stage === "match" && scanned) {
    return <MatchFound wine={scanned} onBack={() => { setStage("idle"); setText(""); }} />;
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
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="text-sm text-cream/85">
          {mode === "camera" ? t("scan.positionLabel") : t("scan.describeWine")}
        </p>
        <span className="h-9 w-9" />
      </header>

      {/* Mode toggle */}
      <div className="px-5 pt-4">
        <div className="mx-auto flex w-full max-w-xs items-center rounded-full border border-white/10 bg-white/5 p-1">
          <button
            onClick={() => setMode("camera")}
            disabled={stage === "analyzing"}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm transition ${
              mode === "camera" ? "bg-gradient-burgundy text-cream shadow-soft" : "text-cream/70 hover:text-cream"
            }`}
          >
            <Camera className="h-4 w-4" /> {t("scan.scan")}
          </button>
          <button
            onClick={() => setMode("text")}
            disabled={stage === "analyzing"}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm transition ${
              mode === "text" ? "bg-gradient-burgundy text-cream shadow-soft" : "text-cream/70 hover:text-cream"
            }`}
          >
            <Type className="h-4 w-4" /> {t("scan.type")}
          </button>
        </div>
      </div>

      {mode === "camera" ? (
        <>
          {/* Camera viewport */}
          <div className="relative flex-1 overflow-hidden">
            <div
              aria-hidden
              className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,oklch(0.22_0.02_30)_0%,oklch(0.08_0.005_30)_70%)]"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              {stage === "analyzing" ? (
                <div className="flex flex-col items-center gap-3 text-gold">
                  <Loader2 className="h-12 w-12 animate-spin" />
                  <p className="font-display text-lg">{t("scan.analyzing")}</p>
                </div>
              ) : (
                <Wine className="h-48 w-48 text-white/10" strokeWidth={0.5} />
              )}
            </div>
            <ScanCorners />
            <p className="absolute inset-x-0 bottom-6 text-center text-xs text-cream/70">{t("scan.align")}</p>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-12 px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-6">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={stage === "analyzing"}
              aria-label="Gallery"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-40"
            >
              <ImageIcon className="h-5 w-5" />
            </button>

            <button
              onClick={() => cameraRef.current?.click()}
              disabled={stage === "analyzing"}
              aria-label="Scan label"
              className="relative flex h-20 w-20 items-center justify-center rounded-full ring-2 ring-gold transition-transform active:scale-95 disabled:opacity-60"
            >
              <span className="absolute inset-1.5 rounded-full bg-cream" />
              {stage === "analyzing" && (
                <Loader2 className="absolute inset-0 m-auto h-8 w-8 animate-spin text-burgundy" />
              )}
            </button>

            <span className="h-12 w-12" />
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col px-5 pt-6 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
          <div className="flex flex-1 flex-col">
            <label className="mb-2 text-xs uppercase tracking-wider text-cream/60">
              Wine description
            </label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={stage === "analyzing"}
              placeholder="e.g. Château Margaux 2015, or 'a bold Italian red from Tuscany with cherry and leather notes'"
              className="min-h-[180px] resize-none border-white/10 bg-white/5 text-base text-cream placeholder:text-cream/40 focus-visible:ring-gold/40"
            />
            <p className="mt-2 text-xs text-cream/50">
              Producer, vintage, region, grape — anything you know helps.
            </p>
          </div>

          <Button
            onClick={handleText}
            disabled={stage === "analyzing" || text.trim().length < 3}
            className="mt-6 h-14 bg-gradient-burgundy text-cream shadow-soft"
          >
            {stage === "analyzing" ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Identify wine</>
            )}
          </Button>
        </div>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </div>
  );
}

function ScanCorners() {
  const cls = "absolute h-12 w-12 border-cream/85";
  return (
    <>
      <div className={`${cls} left-8 top-8 border-l-2 border-t-2 rounded-tl-2xl`} />
      <div className={`${cls} right-8 top-8 border-r-2 border-t-2 rounded-tr-2xl`} />
      <div className={`${cls} left-8 bottom-8 border-l-2 border-b-2 rounded-bl-2xl`} />
      <div className={`${cls} right-8 bottom-8 border-r-2 border-b-2 rounded-br-2xl`} />
    </>
  );
}

function MatchFound({ wine, onBack }: { wine: ScannedWine; onBack: () => void }) {
  const navigate = useNavigate();
  const t = useT();
  const flag = countryToFlag(wine.country);
  const wineTypeLabel = (wine.wine_type ?? "Wine").charAt(0).toUpperCase() + (wine.wine_type ?? "wine").slice(1) + " Wine";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background text-foreground"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <header className="flex items-center justify-between px-5 pt-4">
        <button
          onClick={onBack}
          aria-label={t("common.back")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 hover:bg-white/10"
        >
          <X className="h-4 w-4" />
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
        <p className="mt-1 text-sm text-muted-foreground">{t("scan.matchDesc")}</p>

        <div className="mt-8 flex w-full items-start gap-3 rounded-2xl border border-white/8 bg-card/60 p-4 shadow-soft">
          <div className="flex h-24 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-b from-burgundy/40 to-background/60">
            {wine.image_url ? (
              <img src={wine.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <Wine className="h-7 w-7 text-gold/60" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg leading-tight text-cream">
              {wine.wine_name ?? "Unknown"} {wine.vintage ?? ""}
            </p>
            <p className="mt-0.5 truncate text-sm text-gold">
              {[wine.region, wine.country].filter(Boolean).join(", ")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {flag && <span className="mr-1">{flag}</span>}
              {wineTypeLabel}
            </p>
            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
              <Check className="h-3 w-3" /> {t("scan.savedToCellar")}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-4">
        <Button variant="outline" onClick={() => navigate({ to: "/wine/$id", params: { id: wine.id } })} className="h-12 border-white/15 bg-transparent">
          {t("scan.viewDetails")}
        </Button>
        <Button
          onClick={() => navigate({ to: "/cellar" })}
          className="h-12 bg-gradient-burgundy text-cream"
        >
          <Wine className="h-4 w-4" /> {t("scan.saveToCellar")}
        </Button>
      </div>
    </div>
  );
}

function countryToFlag(country: string | null | undefined): string | null {
  if (!country) return null;
  const map: Record<string, string> = {
    france: "🇫🇷", frankrike: "🇫🇷",
    italy: "🇮🇹", italien: "🇮🇹",
    spain: "🇪🇸", spanien: "🇪🇸",
    portugal: "🇵🇹",
    germany: "🇩🇪", tyskland: "🇩🇪",
    austria: "🇦🇹", österrike: "🇦🇹",
    "usa": "🇺🇸", "united states": "🇺🇸",
    chile: "🇨🇱",
    argentina: "🇦🇷",
    australia: "🇦🇺", australien: "🇦🇺",
    "new zealand": "🇳🇿", nyazeeland: "🇳🇿",
    "south africa": "🇿🇦", sydafrika: "🇿🇦",
    sweden: "🇸🇪", sverige: "🇸🇪",
    greece: "🇬🇷", grekland: "🇬🇷",
    hungary: "🇭🇺", ungern: "🇭🇺",
  };
  return map[country.trim().toLowerCase()] ?? null;
}
