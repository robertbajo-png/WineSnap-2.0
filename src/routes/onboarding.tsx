import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ScanLine, Wine, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { logEvent } from "@/lib/analytics";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Welcome — WineSnap" }] }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const t = useT();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  const steps: { icon: LucideIcon; title: string; desc: string }[] = [
    { icon: ScanLine, title: t("onboard.step1.title"), desc: t("onboard.step1.desc") },
    { icon: Wine, title: t("onboard.step2.title"), desc: t("onboard.step2.desc") },
    { icon: Sparkles, title: t("onboard.step3.title"), desc: t("onboard.step3.desc") },
  ];

  const finish = async (destination: "/scan" | "/taste") => {
    if (user) {
      await supabase.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", user.id);
      logEvent("onboarding_finished", { destination });
    }
    navigate({ to: destination });
  };

  const current = steps[step];
  const Icon = current.icon;
  const isLast = step === steps.length - 1;

  return (
    <div
      className="relative flex min-h-screen flex-col bg-background px-6 pb-10 text-foreground"
      style={{ paddingTop: "max(env(safe-area-inset-top), 1.5rem)" }}
    >
      <div className="flex items-center justify-between">
        <span className="font-display text-lg text-gold">WineSnap</span>
        <button
          onClick={() => finish("/scan")}
          className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          {t("onboard.skip")}
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-full border border-gold/40 bg-gradient-to-br from-burgundy/40 to-background shadow-elegant">
          <Icon className="h-10 w-10 text-gold" strokeWidth={1.4} />
        </div>
        <h1 className="font-display text-3xl leading-tight text-cream">{current.title}</h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">{current.desc}</p>
      </div>

      <div className="mb-6 flex justify-center gap-2">
        {steps.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === step ? "w-6 bg-gold" : "w-1.5 bg-white/20",
            )}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {!isLast ? (
          <Button
            onClick={() => setStep((s) => s + 1)}
            className="h-12 rounded-2xl bg-gradient-burgundy font-display text-base text-cream"
          >
            {t("onboard.next")}
          </Button>
        ) : (
          <>
            <Button
              onClick={() => finish("/taste")}
              className="h-12 rounded-2xl bg-gradient-burgundy font-display text-base text-cream"
            >
              {t("onboard.finish")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => finish("/scan")}
              className="h-11 font-display text-sm text-gold"
            >
              {t("home.cta.start")}
            </Button>
          </>
        )}
        {step > 0 && !isLast && (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="mt-1 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {t("onboard.back")}
          </button>
        )}
      </div>
    </div>
  );
}
