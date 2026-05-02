import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Star, Wine, Plus, Calendar, MapPin, ChevronDown } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  notes: string | null;
  user_rating: number | null;
  primary_notes: string[] | null;
  acidity: number | null; tannin: number | null; body: number | null; sweetness: number | null;
};

function NotesPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [w, setW] = useState<WineRow | null>(null);
  const [rating, setRating] = useState(4);
  const [aromas, setAromas] = useState<string[]>(["Black cherry", "Oak", "Vanilla", "Cedar", "Tobacco"]);
  const [acidity, setAcidity] = useState(70);
  const [tannin, setTannin] = useState(80);
  const [body, setBody] = useState(85);
  const [sweetness, setSweetness] = useState(15);
  const [finish, setFinish] = useState<"Short" | "Medium" | "Long">("Medium");
  const [text, setText] = useState("Beautiful balance of dark fruit and oak. Firm tannins with a long, elegant finish.");

  useEffect(() => {
    supabase.from("wines").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      const r = data as WineRow | null;
      setW(r);
      if (r) {
        if (r.user_rating != null) setRating(r.user_rating);
        if (r.primary_notes?.length) setAromas(r.primary_notes.slice(0, 5));
        if (r.notes) setText(r.notes);
        if (r.acidity != null) setAcidity(r.acidity * 10);
        if (r.tannin != null) setTannin(r.tannin * 10);
        if (r.body != null) setBody(r.body * 10);
        if (r.sweetness != null) setSweetness(r.sweetness * 10);
      }
    });
  }, [id]);

  const removeAroma = (a: string) => setAromas(aromas.filter((x) => x !== a));

  const save = async () => {
    const { error } = await supabase
      .from("wines")
      .update({
        user_rating: Math.round(rating),
        notes: text,
        primary_notes: aromas,
        acidity: Math.round(acidity / 10),
        tannin: Math.round(tannin / 10),
        body: Math.round(body / 10),
        sweetness: Math.round(sweetness / 10),
      })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Note saved");
    navigate({ to: "/wine/$id", params: { id } });
  };

  if (!w) return <AppShell><div className="mt-20 text-center text-muted-foreground">Loading…</div></AppShell>;

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        <header className="flex items-center justify-between">
          <button onClick={() => window.history.back()} className="text-sm text-foreground/80">Cancel</button>
          <h1 className="font-display text-xl text-gold">Tasting Notes</h1>
          <button onClick={save} className="rounded-full bg-gradient-burgundy px-3.5 py-1.5 text-xs font-medium text-cream">Save Note</button>
        </header>

        {/* Wine card */}
        <section className="mt-4 flex items-center gap-3 rounded-xl border border-white/8 bg-card/50 p-3">
          <div className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-b from-burgundy/40 to-background/60">
            {w.image_url ? <img src={w.image_url} alt="" className="h-full w-full object-cover" /> : <Wine className="h-5 w-5 text-gold/60" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base text-cream">{w.wine_name ?? "Unknown"} {w.vintage ?? ""}</p>
            <p className="truncate text-xs text-gold">{[w.region, w.country].filter(Boolean).join(", ")}</p>
            <div className="mt-0.5 flex items-center gap-1 text-[11px]">
              <span className="rounded border border-white/10 bg-white/5 px-1.5 text-[10px] tracking-wider text-muted-foreground">{w.vintage ?? "—"}</span>
              <Star className="ml-1 h-3 w-3 fill-gold text-gold" />
              <span>{rating.toFixed(1)}</span>
            </div>
          </div>
        </section>

        {/* Overall Rating */}
        <section className="mt-5">
          <p className="text-sm text-foreground/85">Overall Rating</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <button key={i} onClick={() => setRating(i)} aria-label={`${i} stars`}>
                  <Star className={cn("h-7 w-7", i <= rating ? "fill-gold text-gold" : "text-white/15")} />
                </button>
              ))}
            </div>
            <span className="ml-auto font-display text-2xl text-cream">{rating.toFixed(1)}</span>
          </div>
        </section>

        {/* Aromas */}
        <section className="mt-6">
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-foreground/85">Aromas</p>
            <button className="text-xs text-burgundy">Edit</button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {aromas.map((a) => (
              <button
                key={a}
                onClick={() => removeAroma(a)}
                className="flex h-9 items-center gap-1.5 rounded-full border border-white/12 bg-card/40 px-3 text-xs"
              >
                <span className="text-sm">{aromaEmoji(a)}</span>
                <span>{a}</span>
              </button>
            ))}
            <button className="flex h-9 items-center gap-1 rounded-full border border-dashed border-gold/40 px-3 text-xs text-gold">
              <Plus className="h-3 w-3" /> Add Aroma
            </button>
          </div>
        </section>

        {/* Palate */}
        <section className="mt-6">
          <p className="text-sm text-foreground/85">Palate</p>
          <div className="mt-3 space-y-3.5">
            <PalateRow label="Acidity" leftLabel="Low" rightLabel="High" value={acidity} onChange={setAcidity} />
            <PalateRow label="Tannin" leftLabel="Low" rightLabel="High" value={tannin} onChange={setTannin} />
            <PalateRow label="Body" leftLabel="Light" rightLabel="Full" value={body} onChange={setBody} />
            <PalateRow label="Sweetness" leftLabel="Dry" rightLabel="Sweet" value={sweetness} onChange={setSweetness} />
          </div>
        </section>

        {/* Finish */}
        <section className="mt-6">
          <p className="text-sm text-foreground/85">Finish</p>
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
                {f}
              </button>
            ))}
          </div>
        </section>

        {/* Notes */}
        <section className="mt-6">
          <p className="text-sm text-foreground/85">Notes</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-xl border border-white/10 bg-card/40 p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-gold/40 focus:outline-none"
          />
        </section>

        {/* Date + Location */}
        <section className="mt-3 mb-4 grid grid-cols-2 gap-2">
          <button className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-card/40 px-3 text-xs text-foreground/85">
            <Calendar className="h-3.5 w-3.5 text-gold" />
            <span>{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            <ChevronDown className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-card/40 px-3 text-xs text-foreground/85">
            <MapPin className="h-3.5 w-3.5 text-gold" />
            <span>Home</span>
            <ChevronDown className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
          </button>
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
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold/80 to-copper" style={{ width: `${value}%` }} />
        <input type="range" min={0} max={100} value={value} onChange={(e) => onChange(parseInt(e.target.value))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cream bg-gold shadow" style={{ left: `${value}%` }} />
      </div>
      <span className="text-right text-[10px] text-muted-foreground">{rightLabel}</span>
    </div>
  );
}

function aromaEmoji(name: string): string {
  const n = name.toLowerCase();
  if (/cherry|berry|plum|currant|strawberry|raspberry/.test(n)) return "🍒";
  if (/oak|wood|cedar|smoke/.test(n)) return "🪵";
  if (/vanilla|cream|butter/.test(n)) return "🍦";
  if (/tobacco|leather|earth/.test(n)) return "🍂";
  if (/apple|pear|citrus|lemon|lime/.test(n)) return "🍏";
  if (/floral|rose|violet/.test(n)) return "🌹";
  if (/spice|pepper|clove|cinnamon/.test(n)) return "🌶️";
  if (/chocolate|cocoa|coffee/.test(n)) return "🍫";
  return "🍇";
}
