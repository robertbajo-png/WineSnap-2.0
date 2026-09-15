import { createFileRoute, useBlocker, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronDown, History, MapPin, Plus, Star, Wine } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AROMA_OPTIONS, AromaIcon } from "@/components/AromaIcon";
import { AromaWheel } from "@/components/AromaWheel";
import { AromaRows } from "@/components/AromaProfileTabs";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useT, useI18n, type TKey } from "@/i18n";
import {
  buildTastingNoteInsert,
  createSaveGuard,
  draftFromStored,
  draftAfterSave,
  EMPTY_TASTING_NOTE,
  runGuardedSave,
  type StoredTastingNote,
  type TastingNoteDraft,
} from "@/lib/tastingNotes";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/wine/$id/notes")({
  head: () => ({
    meta: [
      { title: "Tasting Notes — WineSnap" },
      { name: "description", content: "Record and compare your personal wine tasting notes." },
      { property: "og:title", content: "Tasting Notes — WineSnap" },
      {
        property: "og:description",
        content: "Record and compare your personal wine tasting notes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotesPage,
});

type WineRow = {
  id: string;
  user_id: string;
  image_url: string | null;
  wine_name: string | null;
  vintage: number | null;
  region: string | null;
  country: string | null;
  primary_notes: string[] | null;
  secondary_notes: string[] | null;
  tertiary_notes: string[] | null;
  body: number | null;
  tannin: number | null;
  acidity: number | null;
  sweetness: number | null;
};

type HistoryRow = StoredTastingNote & { id: string; created_at: string };
type SaveResult = { data: unknown; error: { message: string } | null };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function NotesPage() {
  const { id } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const { lang } = useI18n();
  const [wine, setWine] = useState<WineRow | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [draft, setDraft] = useState<TastingNoteDraft>(() => EMPTY_TASTING_NOTE(today()));
  const [baseline, setBaseline] = useState<TastingNoteDraft>(() => EMPTY_TASTING_NOTE(today()));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const saveGuard = useRef(createSaveGuard());

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(baseline),
    [draft, baseline],
  );
  const aiAromas = useMemo(
    () => [
      ...(wine?.primary_notes ?? []),
      ...(wine?.secondary_notes ?? []),
      ...(wine?.tertiary_notes ?? []),
    ],
    [wine],
  );

  useEffect(() => {
    if (!user && !authLoading) navigate({ to: "/login" });
  }, [authLoading, navigate, user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    Promise.all([
      supabase
        .from("wines")
        .select(
          "id,user_id,image_url,wine_name,vintage,region,country,primary_notes,secondary_notes,tertiary_notes,body,tannin,acidity,sweetness",
        )
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("tasting_notes")
        .select("*")
        .eq("wine_id", id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ])
      .then(([wineResult, notesResult]) => {
        if (!active) return;
        if (wineResult.error) toast.error(t("notes.loadFailed"));
        if (notesResult.error) toast.error(t("notes.historyFailed"));
        setWine(wineResult.data as WineRow | null);
        setHistory((notesResult.data as unknown as HistoryRow[] | null) ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        toast.error(t("notes.loadFailed"));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, t, user]);

  useBlocker({
    disabled: !dirty,
    enableBeforeUnload: dirty,
    shouldBlockFn: () => !window.confirm(t("notes.unsavedConfirm")),
  });

  const leave = () => {
    navigate({ to: "/wine/$id", params: { id } });
  };

  const setField = <K extends keyof TastingNoteDraft>(key: K, value: TastingNoteDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const addAroma = (name: string) => {
    const clean = name.trim().slice(0, 60);
    if (!clean) return;
    setDraft((current) => {
      if (
        current.aromas.some((aroma) => aroma.name.toLocaleLowerCase() === clean.toLocaleLowerCase())
      )
        return current;
      return {
        ...current,
        aromas: [...current.aromas, { name: clean, active: true, intensity: null }],
      };
    });
    setPickerOpen(false);
  };

  const save = async () => {
    if (!user || !wine || wine.user_id !== user.id || saving) return;
    setSaving(true);
    const payload = buildTastingNoteInsert(draft, user.id, id);
    const outcome = await runGuardedSave<SaveResult>(saveGuard.current, async () =>
      supabase
        .from("tasting_notes")
        .insert(payload as never)
        .select("*")
        .single(),
    );
    if (!outcome.started) return;
    setSaving(false);
    if (outcome.error || outcome.result?.error || !outcome.result?.data) {
      toast.error(t("notes.saveFailed"));
      return;
    }
    setHistory((current) => [outcome.result?.data as unknown as HistoryRow, ...current]);
    const empty = EMPTY_TASTING_NOTE(today());
    // Preserve edits made while the submitted snapshot was being saved.
    setDraft((current) => draftAfterSave(current, draft, empty));
    setBaseline(empty);
    toast.success(t("notes.saved"));
  };

  if (loading || authLoading)
    return (
      <AppShell>
        <p className="mt-20 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
      </AppShell>
    );

  if (!wine)
    return (
      <AppShell>
        <p className="mt-20 text-center text-sm text-muted-foreground">{t("wine.notFound")}</p>
      </AppShell>
    );

  return (
    <AppShell hideNav>
      <div className="-mx-5 -mt-6 min-h-screen px-5 pb-8 pt-3">
        <header className="grid grid-cols-[72px_1fr_72px] items-center">
          <Button variant="ghost" size="sm" onClick={leave} className="justify-start px-0">
            {t("common.cancel")}
          </Button>
          <h1 className="text-center font-display text-2xl text-gold">{t("notes.title")}</h1>
          <div />
        </header>

        <section className="mt-5 flex items-center gap-3 border-b border-border pb-4">
          <div className="flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-card">
            {wine.image_url ? (
              <img src={wine.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <Wine className="h-5 w-5 text-gold" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-display text-lg leading-tight text-cream">
              {wine.wine_name ?? t("wine.unknown")} {wine.vintage ?? ""}
            </p>
            <p className="mt-1 text-xs text-gold">
              {[wine.region, wine.country].filter(Boolean).join(", ") || "—"}
            </p>
          </div>
        </section>

        <Tabs defaultValue="mine" className="mt-5">
          <TabsList className="grid h-11 w-full grid-cols-2 rounded-md border border-border bg-card/60 p-1">
            <TabsTrigger value="ai" className="rounded-sm">
              {t("notes.tab.ai")}
            </TabsTrigger>
            <TabsTrigger value="mine" className="rounded-sm">
              {t("notes.tab.mine")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="mt-6">
            <SectionTitle>{t("notes.aiAromas")}</SectionTitle>
            {aiAromas.length ? (
              <AromaRows
                aromas={aiAromas.map((name) => ({ name, active: true, intensity: null }))}
                readOnly
              />
            ) : (
              <p className="border-y border-border py-5 text-sm text-muted-foreground">
                {t("notes.aiEmpty")}
              </p>
            )}
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              {t("notes.aiDisclaimer")}
            </p>
          </TabsContent>

          <TabsContent value="mine" className="mt-6 space-y-7">
            <section>
              <div className="flex items-center justify-between gap-3">
                <SectionTitle>{t("notes.myAromas")}</SectionTitle>
                <AromaPicker open={pickerOpen} onOpenChange={setPickerOpen} onAdd={addAroma} />
              </div>
              {draft.aromas.length ? (
                <AromaRows
                  aromas={draft.aromas}
                  onActive={(index, active) =>
                    setDraft((current) => ({
                      ...current,
                      aromas: current.aromas.map((aroma, i) =>
                        i === index ? { ...aroma, active } : aroma,
                      ),
                    }))
                  }
                  onIntensity={(index, intensity) =>
                    setDraft((current) => ({
                      ...current,
                      aromas: current.aromas.map((aroma, i) =>
                        i === index ? { ...aroma, intensity, active: true } : aroma,
                      ),
                    }))
                  }
                />
              ) : (
                <p className="border-y border-border py-5 text-sm text-muted-foreground">
                  {t("notes.aromasEmpty")}
                </p>
              )}
            </section>

            <section>
              <label htmlFor="note-summary" className="font-display text-lg text-gold">
                {t("notes.summary")}
              </label>
              <Textarea
                id="note-summary"
                value={draft.summary}
                onChange={(e) => setField("summary", e.target.value)}
                rows={4}
                placeholder={t("notes.summaryPh")}
                className="mt-3 bg-card/40"
              />
            </section>

            <section>
              <SectionTitle>{t("notes.overall")}</SectionTitle>
              <div
                className="mt-3 flex items-center gap-2"
                role="radiogroup"
                aria-label={t("notes.overall")}
              >
                {[1, 2, 3, 4, 5].map((rating) => (
                  <Button
                    key={rating}
                    type="button"
                    variant="ghost"
                    size="icon"
                    role="radio"
                    aria-checked={draft.rating === rating}
                    aria-label={`${rating} / 5`}
                    onClick={() => setField("rating", rating)}
                  >
                    <Star
                      className={cn(
                        "h-6 w-6",
                        draft.rating != null && rating <= draft.rating
                          ? "fill-gold text-gold"
                          : "text-muted-foreground",
                      )}
                    />
                  </Button>
                ))}
              </div>
            </section>

            <section>
              <SectionTitle>{t("notes.palate")}</SectionTitle>
              <div className="mt-3 space-y-5">
                {(["acidity", "tannin", "body", "sweetness"] as const).map((field) => (
                  <OptionalTasteSlider
                    key={field}
                    label={t(`taste.${field}` as TKey)}
                    value={draft[field]}
                    onChange={(value) => setField(field, value)}
                  />
                ))}
              </div>
            </section>

            <section>
              <SectionTitle>{t("notes.finish")}</SectionTitle>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(["Short", "Medium", "Long"] as const).map((finish) => (
                  <Button
                    key={finish}
                    type="button"
                    variant={draft.finish === finish ? "default" : "outline"}
                    onClick={() => setField("finish", finish)}
                  >
                    {t(`notes.${finish.toLowerCase()}` as TKey)}
                  </Button>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex h-11 items-center gap-2 rounded-md border border-input bg-card/40 px-3 text-xs">
                <Calendar className="h-4 w-4 text-gold" />
                <span className="sr-only">{t("notes.date")}</span>
                <input
                  type="date"
                  value={draft.tastedAt}
                  onChange={(e) => setField("tastedAt", e.target.value)}
                  className="min-w-0 flex-1 bg-transparent focus:outline-none"
                />
              </label>
              <label className="flex h-11 items-center gap-2 rounded-md border border-input bg-card/40 px-3 text-xs">
                <MapPin className="h-4 w-4 text-gold" />
                <span className="sr-only">{t("notes.location")}</span>
                <input
                  value={draft.location}
                  onChange={(e) => setField("location", e.target.value)}
                  placeholder={t("notes.locationPh")}
                  className="min-w-0 flex-1 bg-transparent focus:outline-none"
                />
              </label>
            </section>

            <ComparisonSection wine={wine} draft={draft} aiAromas={aiAromas} />
            <WheelSection />
            <HistorySection
              history={history}
              lang={lang}
              onUse={(note) => setDraft(draftFromStored(note))}
            />

            <Button
              onClick={save}
              disabled={saving || !dirty}
              className="h-11 w-full bg-burgundy text-cream hover:bg-burgundy/90"
            >
              {saving ? t("login.wait") : t("notes.saveMine")}
            </Button>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-lg text-gold">{children}</h2>;
}

function AromaPicker({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (name: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const exact = AROMA_OPTIONS.some(
    (name) => name.toLocaleLowerCase() === query.trim().toLocaleLowerCase(),
  );
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Plus />
          {t("notes.addAroma")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2.5rem))] p-0">
        <Command shouldFilter>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t("notes.searchAroma")}
          />
          <CommandList>
            <CommandEmpty>{t("notes.noAromaMatch")}</CommandEmpty>
            <CommandGroup>
              {query.trim() && !exact && (
                <CommandItem value={query} onSelect={() => onAdd(query)}>
                  <Plus />
                  {t("notes.addOwn").replace("{name}", query.trim())}
                </CommandItem>
              )}
              {AROMA_OPTIONS.map((name) => (
                <CommandItem key={name} value={name} onSelect={() => onAdd(name)}>
                  <AromaIcon name={name} size={28} />
                  {name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function OptionalTasteSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
}) {
  const t = useT();
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {value == null ? t("notes.notSet") : `${value}/10`}
        </span>
      </div>
      {value == null ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(1)}
          className="w-full"
        >
          {t("notes.chooseValue")}
        </Button>
      ) : (
        <Slider
          min={1}
          max={10}
          step={1}
          value={[value]}
          onValueChange={(next) => next[0] != null && onChange(next[0])}
          aria-label={label}
        />
      )}
    </div>
  );
}

function Expandable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-between border-y border-border px-0 font-display text-base text-gold"
        >
          {title}
          <ChevronDown />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="py-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function ComparisonSection({
  wine,
  draft,
  aiAromas,
}: {
  wine: WineRow;
  draft: TastingNoteDraft;
  aiAromas: string[];
}) {
  const t = useT();
  const active = draft.aromas.filter((aroma) => aroma.active).map((aroma) => aroma.name);
  return (
    <Expandable title={t("notes.compareAi")}>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="mb-2 font-medium text-gold">{t("notes.tab.ai")}</p>
          <p className="leading-relaxed text-muted-foreground">{aiAromas.join(", ") || "—"}</p>
          <TasteValues wine={wine} />
        </div>
        <div>
          <p className="mb-2 font-medium text-gold">{t("notes.tab.mine")}</p>
          <p className="leading-relaxed text-muted-foreground">{active.join(", ") || "—"}</p>
          <TasteValues wine={draft} />
        </div>
      </div>
    </Expandable>
  );
}

function TasteValues({
  wine,
}: {
  wine:
    | Pick<WineRow, "body" | "tannin" | "acidity" | "sweetness">
    | Pick<TastingNoteDraft, "body" | "tannin" | "acidity" | "sweetness">;
}) {
  const t = useT();
  return (
    <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
      {(["body", "tannin", "acidity", "sweetness"] as const).map((key) => (
        <div key={key} className="flex justify-between gap-2">
          <dt>{t(`taste.${key}` as TKey)}</dt>
          <dd>{wine[key] == null ? "—" : `${wine[key]}/10`}</dd>
        </div>
      ))}
    </dl>
  );
}

function WheelSection() {
  const t = useT();
  return (
    <Expandable title={t("notes.showWheel")}>
      <div className="flex justify-center overflow-hidden">
        <AromaWheel size={300} showLabels />
      </div>
    </Expandable>
  );
}

function HistorySection({
  history,
  lang,
  onUse,
}: {
  history: HistoryRow[];
  lang: "sv" | "en";
  onUse: (note: HistoryRow) => void;
}) {
  const t = useT();
  return (
    <Expandable title={t("notes.previous")}>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("notes.previousEmpty")}</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {history.map((note) => (
            <li key={note.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-gold">
                    {new Date(note.tasted_at).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-US")}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-foreground/80">
                    {note.notes || note.aromas?.join(", ") || "—"}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => onUse(note)}>
                  <History />
                  {t("notes.useAsNew")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Expandable>
  );
}
