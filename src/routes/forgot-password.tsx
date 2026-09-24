import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { recoveryRedirectUrl } from "@/lib/authRedirect";
import { useT } from "@/i18n";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — WineSnap" },
      {
        name: "description",
        content: "Request a password reset link for your WineSnap account.",
      },
      { property: "og:title", content: "Reset your password — WineSnap" },
      {
        property: "og:description",
        content: "Request a password reset link for your WineSnap account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: recoveryRedirectUrl(window.location.origin),
      });
      // Rate limiting is the only error we surface; everything else stays
      // neutral so we never reveal whether an account exists.
      if (err && (err.status === 429 || /rate limit/i.test(err.message))) {
        setError(t("reset.rateLimit"));
        return;
      }
      if (err && err.status && err.status >= 500) {
        setError(t("reset.networkError"));
        return;
      }
      setSent(true);
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
        <h1 className="font-display text-2xl">{t("reset.forgotTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("reset.forgotSub")}</p>

        {sent ? (
          <div className="mt-5 space-y-4" role="status" aria-live="polite">
            <p className="text-sm text-foreground">{t("reset.sentNeutral")}</p>
            <Button asChild variant="outline" className="h-11 w-full">
              <Link to="/login">{t("reset.backToLogin")}</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4" noValidate={false}>
            <div className="space-y-1.5">
              <Label htmlFor="reset-email">{t("login.email")}</Label>
              <Input
                id="reset-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              {busy ? t("login.wait") : t("reset.sendLink")}
            </Button>
          </form>
        )}

        <div className="mt-4 text-center">
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
            {t("reset.backToLogin")}
          </Link>
        </div>
      </Card>
    </AppShell>
  );
}
