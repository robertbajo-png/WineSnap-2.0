import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Logga in — Winesnap" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Konto skapat — logga in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fel");
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
        <h1 className="font-display text-2xl">{mode === "signin" ? "Välkommen tillbaka" : "Skapa konto"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signin" ? "Logga in för att fortsätta" : "Börja samla din vinprofil"}
        </p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Namn</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ditt namn" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">E-post</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Lösenord</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} className="h-11 w-full bg-gradient-wine">
            {busy ? "Vänta…" : mode === "signin" ? "Logga in" : "Skapa konto"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "Inget konto? Skapa ett" : "Har du redan ett konto? Logga in"}
        </button>
      </Card>
    </AppShell>
  );
}
