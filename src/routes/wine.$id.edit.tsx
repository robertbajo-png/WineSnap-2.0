import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useT } from "@/i18n";

export const Route = createFileRoute("/wine/$id/edit")({
  head: () => ({ meta: [{ title: "Edit wine — WineSnap" }] }),
  component: EditPage,
});

const TYPES = ["red", "white", "rose", "sparkling", "dessert", "fortified"] as const;

type Form = {
  producer: string;
  wine_name: string;
  vintage: string;
  region: string;
  country: string;
  wine_type: string;
  grape_varieties: string;
  description: string;
  serving_temp: string;
  glass_type: string;
  purchase_price: string;
  purchase_currency: string;
  purchased_at: string;
  consumed_at: string;
  quantity: string;
};

const empty: Form = {
  producer: "", wine_name: "", vintage: "", region: "", country: "",
  wine_type: "red", grape_varieties: "", description: "", serving_temp: "", glass_type: "",
  purchase_price: "", purchase_currency: "SEK", purchased_at: "", consumed_at: "", quantity: "1",
};

function EditPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const t = useT();
  const [form, setForm] = useState<Form>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("wines").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      if (data) {
        const d = data as typeof data & {
          purchase_price?: number | null;
          purchase_currency?: string | null;
          purchased_at?: string | null;
          consumed_at?: string | null;
          quantity?: number | null;
        };
        setForm({
          producer: d.producer ?? "",
          wine_name: d.wine_name ?? "",
          vintage: d.vintage ? String(d.vintage) : "",
          region: d.region ?? "",
          country: d.country ?? "",
          wine_type: d.wine_type ?? "red",
          grape_varieties: (d.grape_varieties ?? []).join(", "),
          description: d.description ?? "",
          serving_temp: d.serving_temp ?? "",
          glass_type: d.glass_type ?? "",
          purchase_price: d.purchase_price != null ? String(d.purchase_price) : "",
          purchase_currency: d.purchase_currency ?? "SEK",
          purchased_at: d.purchased_at ?? "",
          consumed_at: d.consumed_at ?? "",
          quantity: d.quantity != null ? String(d.quantity) : "1",
        });
      }
      setLoading(false);
    });
  }, [id]);

  const upd = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    const price = form.purchase_price ? Number(form.purchase_price) : null;
    const qty = form.quantity ? Math.max(1, Math.floor(Number(form.quantity))) : 1;
    const payload = {
      producer: form.producer.trim() || null,
      wine_name: form.wine_name.trim() || null,
      vintage: form.vintage ? Number(form.vintage) || null : null,
      region: form.region.trim() || null,
      country: form.country.trim() || null,
      wine_type: form.wine_type as "red" | "white" | "rose" | "sparkling" | "dessert" | "fortified",
      grape_varieties: form.grape_varieties.split(",").map((s) => s.trim()).filter(Boolean),
      description: form.description.trim() || null,
      serving_temp: form.serving_temp.trim() || null,
      glass_type: form.glass_type.trim() || null,
      purchase_price: Number.isFinite(price as number) ? price : null,
      purchase_currency: form.purchase_currency.trim().toUpperCase() || null,
      purchased_at: form.purchased_at || null,
      consumed_at: form.consumed_at || null,
      quantity: qty,
    } as never;
    const { error } = await supabase.from("wines").update(payload).eq("id", id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(t("edit.saved"));
    navigate({ to: "/wine/$id", params: { id } });
  };

  if (loading) return <AppShell><p className="mt-10 text-center text-sm text-muted-foreground">{t("common.loading")}</p></AppShell>;

  return (
    <AppShell>
      <div className="-mx-5 -mt-6 px-5 pt-3">
        <header className="flex items-center justify-between">
          <Link to="/wine/$id" params={{ id }} aria-label={t("common.back")} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="font-display text-lg">{t("edit.title")}</h1>
          <div className="w-9" />
        </header>

        <Card className="mt-5 space-y-3 bg-card/50 p-4">
          <Field label={t("wine.producer")} value={form.producer} onChange={upd("producer")} />
          <Field label={t("edit.wineName")} value={form.wine_name} onChange={upd("wine_name")} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("wine.vintage")} value={form.vintage} onChange={upd("vintage")} inputMode="numeric" />
            <div>
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("edit.type")}</label>
              <select
                value={form.wine_type}
                onChange={upd("wine_type")}
                className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-background/60 px-3 text-sm focus:border-gold/40 focus:outline-none"
              >
                {TYPES.map((tp) => <option key={tp} value={tp}>{t(`type.${tp === "rose" ? "rose" : tp}` as any) ?? tp}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("wine.region")} value={form.region} onChange={upd("region")} />
            <Field label={t("edit.country")} value={form.country} onChange={upd("country")} />
          </div>
          <Field label={t("edit.grapes")} value={form.grape_varieties} onChange={upd("grape_varieties")} placeholder={t("edit.grapesPh")} />
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("edit.description")}</label>
            <textarea
              value={form.description}
              onChange={upd("description")}
              rows={4}
              className="mt-1 w-full rounded-lg border border-white/10 bg-background/60 p-3 text-sm focus:border-gold/40 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("wine.serving")} value={form.serving_temp} onChange={upd("serving_temp")} placeholder="16–18°C" />
            <Field label={t("wine.glass")} value={form.glass_type} onChange={upd("glass_type")} />
          </div>
        </Card>

        <Button onClick={save} disabled={saving} className="mt-5 w-full bg-gradient-burgundy text-cream">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t("edit.save")}
        </Button>
      </div>
    </AppShell>
  );
}

function Field({ label, value, onChange, placeholder, inputMode }: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  inputMode?: "numeric" | "text";
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</label>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        inputMode={inputMode}
        className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-background/60 px-3 text-sm focus:border-gold/40 focus:outline-none"
      />
    </div>
  );
}
