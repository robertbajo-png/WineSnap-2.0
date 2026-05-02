import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Menu, Zap, ImageIcon, Flashlight, Loader2, Wine, Check } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WineSnap — Skanna vinetiketter" },
      { name: "description", content: "Fota en vinetikett och få producent, druva, smakprofil och matparning på sekunder." },
      { property: "og:title", content: "WineSnap" },
      { property: "og:description", content: "Sommelierns insikt — direkt i fickan." },
    ],
  }),
  component: HomePage,
});

type RecentWine = {
  id: string;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  region: string | null;
  image_url: string | null;
};

function HomePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [lastScan, setLastScan] = useState<RecentWine | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("wines")
      .select("id,producer,wine_name,vintage,region,image_url")
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => setLastScan(((data as RecentWine[]) ?? [])[0] ?? null));
  }, [user]);

  const handleFile = async (file: File) => {
    if (!user) {
      toast.info("Logga in för att skanna vin");
      navigate({ to: "/login" });
      return;
    }
    setAnalyzing(true);
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
        .select("id")
        .single();
      if (insErr) throw insErr;

      navigate({ to: "/wine/$id", params: { id: inserted.id } });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Något gick fel");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <AppShell>
      <div className="-mx-5 -mt-6">
        {/* Top bar */}
        <header className="flex items-center justify-between px-5 pt-4">
          <button aria-label="Meny" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 hover:bg-white/10">
            <Menu className="h-4 w-4" />
          </button>
          <Logo size="md" />
          {!loading && !user ? (
            <Link
              to="/login"
              className="flex h-9 items-center rounded-full bg-white/5 px-3 text-xs font-medium hover:bg-white/10"
            >
              Logga in
            </Link>
          ) : (
            <button aria-label="Snabbskanna" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 hover:bg-white/10">
              <Zap className="h-4 w-4 text-gold" />
            </button>
          )}
        </header>

        {/* Camera frame / hero */}
        <div className="relative mx-5 mt-6 aspect-[3/4] overflow-hidden rounded-3xl bg-gradient-to-b from-[oklch(0.18_0.01_30)] to-[oklch(0.1_0.008_30)] shadow-elegant">
          {/* Bottle illustration placeholder */}
          <div className="absolute inset-0 flex items-center justify-center">
            {analyzing ? (
              <div className="flex flex-col items-center gap-3 text-gold">
                <Loader2 className="h-10 w-10 animate-spin" />
                <p className="font-display text-base">Analyserar vin…</p>
              </div>
            ) : (
              <Wine className="h-32 w-32 text-white/8" strokeWidth={0.6} />
            )}
          </div>

          {/* Scan corner brackets */}
          <ScanCorners />

          {/* Veil */}
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-veil" />

          {/* Hint pill */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-1.5 rounded-full border border-white/15 bg-background/60 px-3 py-1.5 text-xs text-cream backdrop-blur-md">
              <span className="opacity-80">Rikta in etiketten i ramen</span>
            </div>
          </div>
        </div>

        {/* Last scan / match card */}
        {lastScan && !analyzing && (
          <Link
            to="/wine/$id"
            params={{ id: lastScan.id }}
            className="mx-5 mt-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-card/60 p-3 shadow-soft backdrop-blur transition-colors hover:bg-card/80"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5">
              {lastScan.image_url ? (
                <img src={lastScan.image_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <Wine className="h-6 w-6 text-gold" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base leading-tight">
                {lastScan.wine_name ?? "Okänt vin"} {lastScan.vintage ? lastScan.vintage : ""}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {[lastScan.region, lastScan.producer].filter(Boolean).join(" • ")}
              </p>
              <p className="mt-0.5 text-xs font-medium text-success">95% Match</p>
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-success/20">
              <Check className="h-4 w-4 text-success" />
            </div>
          </Link>
        )}

        {/* Scan controls */}
        <div className="mt-8 flex items-center justify-center gap-10 px-5">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={analyzing}
            aria-label="Galleri"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-foreground hover:bg-white/10 disabled:opacity-40"
          >
            <ImageIcon className="h-5 w-5" />
          </button>

          <button
            onClick={() => cameraRef.current?.click()}
            disabled={analyzing}
            aria-label="Skanna etikett"
            className="relative flex h-20 w-20 items-center justify-center rounded-full bg-background ring-2 ring-gold transition-transform active:scale-95 disabled:opacity-60"
          >
            <span className="absolute inset-1.5 rounded-full bg-cream" />
            {analyzing && (
              <Loader2 className="absolute inset-0 m-auto h-8 w-8 animate-spin text-burgundy" />
            )}
          </button>

          <button
            aria-label="Ficklampa"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-foreground hover:bg-white/10"
          >
            <Flashlight className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-4 text-center font-display text-sm uppercase tracking-[0.25em] text-muted-foreground">
          Skanna etikett
        </p>
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
    </AppShell>
  );
}

function ScanCorners() {
  const cls =
    "absolute h-10 w-10 border-cream/80";
  return (
    <>
      <div className={`${cls} left-6 top-6 border-l-2 border-t-2 rounded-tl-xl`} />
      <div className={`${cls} right-6 top-6 border-r-2 border-t-2 rounded-tr-xl`} />
      <div className={`${cls} left-6 bottom-6 border-l-2 border-b-2 rounded-bl-xl`} />
      <div className={`${cls} right-6 bottom-6 border-r-2 border-b-2 rounded-br-xl`} />
    </>
  );
}
