import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download, ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { collectOwnData } from "@/lib/dataExport";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { toast } from "sonner";
export function DataControls() {
  const { user } = useAuth();
  const { lang, t } = useI18n();
  const [busy, setBusy] = useState(false);
  const owner = useRef(user?.id);
  owner.current = user?.id;
  const exportData = async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const id = user.id;
      const result = await collectOwnData(
        id,
        (table, uid, from, to) =>
          supabase
            .from(table)
            .select("*")
            .filter(table === "profiles" ? "id" : "user_id", "eq", uid)
            .order(table === "taste_profile" ? "user_id" : "id")
            .range(from, to),
        () => owner.current === id,
      );
      const { data, error } = await supabase.auth.getUser();
      if (error || data.user?.id !== id) throw new Error("Account changed");
      const url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              { ...result, account: { id, email: user.email, created_at: user.created_at } },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `winesnap-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error(t("common.error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mt-6 border-t border-white/10 pt-4">
      <h2 className="font-display text-lg text-gold">
        {lang === "sv" ? "Dina data" : "Your data"}
      </h2>
      <Link to="/privacy" className="flex min-h-12 items-center gap-3 text-base">
        <ShieldCheck className="h-5 w-5 text-gold" />
        {lang === "sv" ? "Integritet och kontakt" : "Privacy and contact"}
      </Link>
      {user && (
        <button
          type="button"
          disabled={busy}
          onClick={exportData}
          className="flex min-h-12 items-center gap-3 text-base disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Download className="h-5 w-5 text-gold" />
          )}
          {lang === "sv" ? "Exportera mina uppgifter" : "Export my data"}
        </button>
      )}
    </section>
  );
}
