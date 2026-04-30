import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, Upload, Loader2, Wine } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Winesnap — Skanna vinetiketter" },
      { name: "description", content: "Fota en vinetikett, få instant info, smakprofil och matparning." },
      { property: "og:title", content: "Winesnap — Skanna vinetiketter" },
      { property: "og:description", content: "Fota en vinetikett, få instant info, smakprofil och matparning." },
    ],
  }),
  component: HomePage,
});

type RecentWine = {
  id: string;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  image_url: string | null;
};

function HomePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [recent, setRecent] = useState<RecentWine[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("wines")
      .select("id,producer,wine_name,vintage,image_url")
      .order("created_at", { ascending: false })
      .limit(3)
      .then(({ data }) => setRecent((data as RecentWine[]) ?? []));
  }, [user]);

  const handleFile = async (file: File) => {
    if (!user) {
      toast.info("Logga in för att skanna vin");
      navigate({ to: "/login" });
      return;
    }
    setAnalyzing(true);
    try {
      // Upload to storage
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("wine-labels").upload(path, file);
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("wine-labels").getPublicUrl(path);

      // Convert to base64 for AI
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
      <header className="mb-8 flex items-center justify-between">
        <Logo size="md" />
        {!loading && !user && (
          <Link to="/login" className="text-sm font-medium text-burgundy hover:underline">
            Logga in
          </Link>
        )}
      </header>

      <h1 className="font-display text-4xl leading-tight text-foreground">
        Fota en <span className="text-burgundy">vinetikett</span> — få sommelierns ord direkt.
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Producent, druva, smakprofil och matparning på sekunder.
      </p>

      <div className="mt-8 space-y-3">
        <Button
          size="lg"
          disabled={analyzing}
          onClick={() => cameraRef.current?.click()}
          className="h-16 w-full bg-gradient-wine text-base shadow-elegant hover:opacity-95"
        >
          {analyzing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Camera className="h-5 w-5" />
          )}
          {analyzing ? "Analyserar vin…" : "Öppna kamera"}
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={analyzing}
          onClick={() => fileRef.current?.click()}
          className="h-14 w-full border-burgundy/30 text-base"
        >
          <Upload className="h-5 w-5" />
          Ladda upp bild
        </Button>
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

      {recent.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-display text-xl text-foreground">Senaste fynden</h2>
          <div className="space-y-2.5">
            {recent.map((w) => (
              <Link key={w.id} to="/wine/$id" params={{ id: w.id }}>
                <Card className="flex items-center gap-3 p-3 shadow-soft transition-all hover:shadow-elegant">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-champagne">
                    {w.image_url ? (
                      <img src={w.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Wine className="h-6 w-6 text-burgundy" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base">{w.wine_name ?? "Okänt vin"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[w.producer, w.vintage].filter(Boolean).join(" • ")}
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
