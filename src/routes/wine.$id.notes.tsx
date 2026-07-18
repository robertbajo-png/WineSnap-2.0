import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Star, Wine, Plus, Calendar, MapPin, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

export const Route = createFileRoute("/wine/$id/notes")({
  head: () => ({ meta: [{ title: "Tasting Notes — WineSnap" }] }),
  component: NotesPage,
});

type WineRow = {
  id: string;
  image_url: string | null;
  wine_name: string | null;
  vintage: number | null;
  region: string | null;
  country: string | null;
  primary_notes: string[] | null;
};

function NotesPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const [w, setW] = useState<WineRow | null>(null);
  const [rating, setRating] = useState(0);
  const [aromas, setAromas] = useState<string[]>([]);
  const [newAroma, setNewAroma] = useState("");
  const [acidity, setAcidity] = useState(50);
  const [tannin, setTannin] = useState(50);
  const [body, setBody] = useState(50);
  const [sweetness, setSweetness] = useState(50);
  const [finish, setFinish] = useState<"Short" | "Medium" | "Long">("Medium");
  const [text, setText] = useState("");
  const [location, setLocation] = useState("Home");
  const [tastedAt, setTastedAt] = useState<string>(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("wines").select("id,image_url,wine_name,vintage,region,country,primary_notes").eq("id", id).maybeSingle().then(({ data }) => {
      const r = data as WineRow | null;
      setW(r);
      if (r?.primary_notes?.length) setAromas(r.primary_notes.slice(0, 5));
    });
  }, [id]);

  const removeAroma = (a: string) => setAromas(aromas.filter((x) => x !== a));
  const addAroma = () => {
    const a = newAroma.trim();
    if (!a) return;
    if (aromas.includes(a)) { setNewAroma(""); return; }
    setAromas([...aromas, a]);
    setNewAroma("");
  };

  const save = async () => {
    if (!user) { navigate({ to: "/login" }); return; }
    setSaving(true);
    const noteRow = {
      user_id: user.id,
      wine_id: id,
      rating: Math.round(rating * 10) / 10 || null,
      aromas,
      body: Math.round(body / 10),
      tannin: Math.round(tannin / 10),
      acidity: Math.round(acidity / 10),
      sweetness: Math.round(sweetness / 10),
      finish,
      notes: text || null,
      location: location || null,
      tasted_at: tastedAt,
    };
    const [{ error: noteErr }, { error: wineErr }] = await Promise.all([
      supabase.from("tasting_notes").insert(noteRow as any),
      supabase.from("wines").update({
        user_rating: Math.round(rating) || null,
        notes: text || null,
        primary_notes: aromas,
        acidity: Math.round(acidity / 10),
        tannin: Math.round(tannin / 10),
        body: Math.round(body / 10),
        sweetness: Math.round(sweetness / 10),
      }).eq("id", id),
    ]);
    setSaving(false);
    if (noteErr || wineErr) return toast.error((noteErr || wineErr)!.message);
    toast.success(t("notes.saved"));
    navigate({ to: "/wine/$id", params: { id } });
  };

  if (!w) return <AppShell><div className="mt-20 text-center text-muted-foreground">{t("common.loading")}</div></AppShell>;

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        <header className="flex items-center justify-between">
          <button onClick={() => window.history.back()} className="text-sm text-foreground/80">{t("common.cancel")}</button>
          <h1 className="font-display text-xl text-gold">{t("notes.title")}</h1>
          <button onClick={save} disabled={saving} className="rounded-full bg-gradient-burgundy px-3.5 py-1.5 text-xs font-medium text-cream disabled:opacity-50">
            {saving ? t("login.wait") : t("notes.save")}
          </button>
        </header>

        <section className="mt-4 flex items-center gap-3 rounded-xl border border-white/8 bg-card/50 p-3">
          <div className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-b from-burgundy/40 to-background/60">
            {w.image_url ? <img src={w.image_url} alt="" className="h-full w-full object-cover" /> : <Wine className="h-5 w-5 text-gold/60" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base text-cream">{w.wine_name ?? "Unknown"} {w.vintage ?? ""}</p>
            <p className="truncate text-xs text-gold">{[w.region, w.country].filter(Boolean).join(", ")}</p>
          </div>
        </section>

        <section className="mt-5">
          <p className="text-sm text-foreground/85">{t("notes.overall")}</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <button key={i} onClick={() => setRating(i)} aria-label={`${i}`}>
                  <Star className={cn("h-7 w-7", i <= rating ? "fill-gold text-gold" : "text-white/15")} />
                </button>
              ))}
            </div>
            <span className="ml-auto font-display text-2xl text-cream">{rating.toFixed(1)}</span>
          </div>
        </section>

        <section className="mt-6">
          <p className="text-sm text-foreground/85">{t("notes.aromas")}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {aromas.map((a) => (
              <button key={a} onClick={() => removeAroma(a)} className="flex h-9 items-center gap-1.5 rounded-full border border-white/12 bg-card/40 px-3 text-xs">
                <span>{a}</span><X className="h-3 w-3 opacity-70" />
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={newAroma}
              onChange={(e) => setNewAroma(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAroma(); } }}
              placeholder={t("notes.addAromaPh")}
              className="h-9 flex-1 rounded-full border border-dashed border-gold/40 bg-transparent px-3.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-gold focus:outline-none"
            />
            <button onClick={addAroma} className="flex h-9 items-center gap-1 rounded-full border border-gold/40 px-3 text-xs text-gold">
              <Plus className="h-3 w-3" /> {t("notes.addAroma")}
            </button>
          </div>
        </section>

        <section className="mt-6">
          <p className="text-sm text-foreground/85">{t("notes.palate")}</p>
          <div className="mt-3 space-y-3.5">
            <PalateRow label={t("taste.acidity")} leftLabel={t("taste.low")} rightLabel={t("taste.high")} value={acidity} onChange={setAcidity} />
            <PalateRow label={t("taste.tannin")} leftLabel={t("taste.low")} rightLabel={t("taste.high")} value={tannin} onChange={setTannin} />
            <PalateRow label={t("taste.body")} leftLabel={t("taste.light")} rightLabel={t("taste.bold")} value={body} onChange={setBody} />
            <PalateRow label={t("taste.sweetness")} leftLabel={t("taste.dry")} rightLabel={t("taste.sweet")} value={sweetness} onChange={setSweetness} />
          </div>
        </section>

        <section className="mt-6">
          <p className="text-sm text-foreground/85">{t("notes.finish")}</p>
          <div className="mt-2 flex gap-2">
            {(["Short", "Medium", "Long"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFinish(f)}
                className={cn(
                  "h-10 flex-1 rounded-xl border text-xs transition-colors",
                  finish === f ? "border-burgundy bg-burgundy text-cream" : "border-white/10 bg-card/40 text-foreground/80",
                )}
              >
                {f === "Short" ? t("notes.short") : f === "Medium" ? t("notes.medium") : t("notes.long")}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <p className="text-sm text-foreground/85">{t("notes.notes")}</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={t("notes.notesPh")}
            className="mt-2 w-full rounded-xl border border-white/10 bg-card/40 p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-gold/40 focus:outline-none"
          />
        </section>

        <section className="mt-3 mb-4 grid grid-cols-2 gap-2">
          <label className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-card/40 px-3 text-xs text-foreground/85">
            <Calendar className="h-3.5 w-3.5 text-gold" />
            <input type="date" value={tastedAt} onChange={(e) => setTastedAt(e.target.value)} className="flex-1 bg-transparent focus:outline-none" />
          </label>
          <label className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-card/40 px-3 text-xs text-foreground/85">
            <MapPin className="h-3.5 w-3.5 text-gold" />
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t("notes.locationPh")} className="flex-1 bg-transparent focus:outline-none placeholder:text-muted-foreground" />
          </label>
        </section>
      </div>
    </AppShell>
  );
}

function PalateRow({ label, leftLabel, rightLabel, value, onChange }: { label: string; leftLabel: string; rightLabel: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-[72px_36px_1fr_36px] items-center gap-2">
      <span className="text-xs text-foreground/85">{label}</span>
      <span className="text-[10px] text-muted-foreground">{leftLabel}</span>
      <div className="relative h-1 rounded-full bg-white/10">
        <div className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold/80 to-copper" style={{ width: `${value}%` }} />
        <span className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cream bg-gold shadow" style={{ left: `${value}%` }} />
        <input type="range" min={0} max={100} value={value} onChange={(e) => onChange(parseInt(e.target.value))} className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" />
      </div>
      <span className="text-right text-[10px] text-muted-foreground">{rightLabel}</span>
    </div>
  );
}
