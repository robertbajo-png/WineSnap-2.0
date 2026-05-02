import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { X, Zap, ImageIcon, HelpCircle, Loader2, Wine, Check, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

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
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [scanned, setScanned] = useState<ScannedWine | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      toast.info("Sign in to scan wine labels");
      navigate({ to: "/login" });
    }
  }, [user, loading, navigate]);

  const handleFile = async (file: File) => {
    if (!user) return;
    setStage("analyzing");
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("wine-labels").upload(path, file);
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
        body: { imageBase64: base64, mimeType: file.type },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const w = data.wine;
      const { data: inserted, error: insErr } = await supabase
        .from("wines")
        .insert({
          user_id: user.id,
          image_url: pub.publicUrl,
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

      setScanned(inserted as ScannedWine);
      setStage("match");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      setStage("idle");
    }
  };

  if (stage === "match" && scanned) {
    return <MatchFound wine={scanned} onBack={() => setStage("idle")} />;
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
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="text-sm text-cream/85">Position label in the frame</p>
        <button
          aria-label="Flash"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 hover:bg-white/10"
        >
          <Zap className="h-4 w-4 text-gold" />
        </button>
      </header>

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
              <p className="font-display text-lg">Analyzing wine…</p>
            </div>
          ) : (
            <Wine className="h-48 w-48 text-white/10" strokeWidth={0.5} />
          )}
        </div>
        <ScanCorners />
        <p className="absolute inset-x-0 bottom-6 text-center text-xs text-cream/70">Align label within the frame</p>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-12 px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-6">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={stage === "analyzing"}
          aria-label="Galleri"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-40"
        >
          <ImageIcon className="h-5 w-5" />
        </button>

        <button
          onClick={() => cameraRef.current?.click()}
          disabled={stage === "analyzing"}
          aria-label="Skanna etikett"
          className="relative flex h-20 w-20 items-center justify-center rounded-full ring-2 ring-gold transition-transform active:scale-95 disabled:opacity-60"
        >
          <span className="absolute inset-1.5 rounded-full bg-cream" />
          {stage === "analyzing" && (
            <Loader2 className="absolute inset-0 m-auto h-8 w-8 animate-spin text-burgundy" />
          )}
        </button>

        <button
          aria-label="Hjälp"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 hover:bg-white/10"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      </div>

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
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="font-display text-base">Scan Result</p>
        <span className="h-9 w-9" />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-success/20 blur-2xl" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-success bg-success/10 shadow-[0_0_40px_oklch(0.7_0.18_145/0.5)]">
            <Check className="h-12 w-12 text-success" strokeWidth={2.5} />
          </div>
        </div>

        <h1 className="mt-6 font-display text-3xl">Match Found</h1>
        <p className="mt-1 text-sm text-muted-foreground">We found a great match for this wine.</p>

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
              {wine.wine_name ?? "Unknown wine"} {wine.vintage ?? ""}
            </p>
            <p className="mt-0.5 truncate text-sm text-gold">
              {[wine.region, wine.country].filter(Boolean).join(", ")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {flag && <span className="mr-1">{flag}</span>}
              {wineTypeLabel}
            </p>
            <div className="mt-1.5 flex items-center gap-1 text-xs">
              <Star className="h-3 w-3 fill-gold text-gold" />
              <span className="font-medium">4.4</span>
              <span className="text-muted-foreground">128 ratings</span>
            </div>
            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
              95% Match
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-4">
        <Button variant="outline" onClick={() => navigate({ to: "/wine/$id", params: { id: wine.id } })} className="h-12 border-white/15 bg-transparent">
          View Details
        </Button>
        <Button
          onClick={() => navigate({ to: "/cellar" })}
          className="h-12 bg-gradient-burgundy text-cream"
        >
          <Wine className="h-4 w-4" /> Save to Cellar
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
