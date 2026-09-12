import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { hasRecoveryGrant, recoveryLinkError } from "@/lib/authRedirect";
import { toast } from "sonner";
import { useT } from "@/i18n";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Choose a new password — WineSnap" },
      { name: "description", content: "Set a new password for your WineSnap account." },
      { property: "og:title", content: "Choose a new password — WineSnap" },
      {
        property: "og:description",
        content: "Set a new password for your WineSnap account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

type State = "checking" | "ready" | "invalid";

function ResetPasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const [state, setState] = useState<State>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const { hash, search } = window.location;

    if (recoveryLinkError(hash, search)) {
      setState("invalid");
      return;
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || session) setState("ready");
    });

    // detectSessionInUrl consumes the recovery grant asynchronously.
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) setState("ready");
      else if (!hasRecoveryGrant(hash, search)) setState("invalid");
      else setTimeout(() => !cancelled && setState((s) => (s === "checking" ? "invalid" : s)), 4000);
    };
    void check();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError(t("reset.tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("reset.mismatch"));
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        if (err.status === 429 || /rate limit/i.test(err.message)) setError(t("reset.rateLimit"));
        else if (/session|expired|jwt/i.test(err.message)) setState("invalid");
        else setError(err.message);
        return;
      }
      toast.success(t("reset.updated"));
      // Fixed internal destination — never a user-supplied redirect.
      navigate({ to: "/", replace: true });
    } catch {
      setError(t("reset.networkError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell hideNav>
      <header className="mb-10 flex justify-center pt-8">
        <Link to="/">
          <Logo size="lg" />
        </Link>
      </header>
      <Card className="p-6 shadow-elegant">
        <h1 className="font-display text-2xl">{t("reset.newTitle")}</h1>

        {state === "checking" && (
          <p className="mt-3 text-sm text-muted-foreground" role="status" aria-live="polite">
            {t("reset.checking")}
          </p>
        )}

        {state === "invalid" && (
          <div className="mt-3 space-y-4">
            <p className="text-sm text-muted-foreground">{t("reset.invalidLink")}</p>
            <Button asChild className="h-11 w-full bg-gradient-gold text-background">
              <Link to="/forgot-password">{t("reset.requestNew")}</Link>
            </Button>
            <Link
              to="/login"
              className="block text-center text-sm text-muted-foreground hover:text-foreground"
            >
              {t("reset.backToLogin")}
            </Link>
          </div>
        )}

        {state === "ready" && (
          <>
            <p className="mt-1 text-sm text-muted-foreground">{t("reset.newSub")}</p>
            <form onSubmit={submit} className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">{t("reset.newPassword")}</Label>
                <Input
                  id="new-password"
                  name="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby={error ? "reset-error" : undefined}
                  aria-invalid={error ? true : undefined}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">{t("reset.confirmPassword")}</Label>
                <Input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-describedby={error ? "reset-error" : undefined}
                  aria-invalid={error ? true : undefined}
                />
              </div>
              {error && (
                <p id="reset-error" role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                disabled={busy}
                className="h-11 w-full bg-gradient-gold text-background"
              >
                {busy ? t("login.wait") : t("reset.savePassword")}
              </Button>
            </form>
          </>
        )}
      </Card>
    </AppShell>
  );
}
