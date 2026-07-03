import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ValtisLogo } from "@/components/valtis/logo";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "signup" ? ("signup" as const) : ("signin" as const),
  }),
  head: () => ({
    meta: [
      { title: "Connexion · Valtis" },
      { name: "description", content: "Accédez à votre espace privé Valtis." },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("Adresse e-mail invalide").max(255),
  password: z.string().min(8, "Au moins 8 caractères").max(128),
  fullName: z.string().trim().max(100).optional(),
});

function AuthPage() {
  const navigate = useNavigate();
  const { mode: initialMode } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"credentials" | "check-email">("credentials");
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    setStep("credentials");
  }, [mode]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password, fullName: mode === "signup" ? fullName : undefined });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Données invalides");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: parsed.data.fullName ?? "" },
          },
        });
        if (error) throw error;
        toast.success("E-mail de confirmation envoyé.");
        setStep("check-email");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
        toast.success("Connexion réussie.");
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur d'authentification";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResendLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) throw error;
      toast.success("Nouvel e-mail de confirmation envoyé.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossible de renvoyer l'e-mail";
      toast.error(message);
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 h-16 flex items-center justify-between max-w-7xl mx-auto w-full">
        <Link to="/" className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Retour
        </Link>
        <ValtisLogo />
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <h1 className="font-display text-3xl font-semibold tracking-tight mb-2">
              {step === "check-email"
                ? "Vérifiez votre boîte mail"
                : mode === "signin"
                ? "Accès privé"
                : "Ouvrir un compte Valtis"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {step === "check-email"
                ? `Un e-mail de confirmation vient d'être envoyé à ${email}.`
                : mode === "signin"
                ? "Connectez-vous à votre espace bancaire."
                : "Quelques secondes pour commencer."}
            </p>
          </div>

          <div className="card-premium rounded-2xl p-8 space-y-5">
            {step === "credentials" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-xs uppercase tracking-wider text-muted-foreground">Nom complet</Label>
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11" />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">E-mail</Label>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">Mot de passe</Label>
                <Input id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11" />
              </div>
              <Button type="submit" variant="gold" className="w-full h-11" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {mode === "signin" ? "Se connecter" : "Créer mon compte"}
              </Button>
            </form>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col items-center text-center gap-3 py-2">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <MailCheck className="w-7 h-7 text-primary" />
                  </div>
                  <p className="text-sm text-foreground">
                    Ouvrez l'e-mail que nous venons de vous envoyer et cliquez sur le bouton
                    <span className="font-medium"> « Confirmer mon adresse »</span> pour activer votre compte Valtis.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Pensez à vérifier vos courriers indésirables si vous ne le voyez pas dans quelques minutes.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="gold"
                  className="w-full h-11"
                  onClick={handleResend}
                  disabled={resendLoading}
                >
                  {resendLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Renvoyer l'e-mail de confirmation
                </Button>
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => setStep("credentials")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ← Modifier l'e-mail
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setStep("credentials");
                    }}
                    className="text-primary hover:underline"
                  >
                    J'ai confirmé, me connecter
                  </button>
                </div>
              </div>
            )}

            {step === "credentials" && (
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
            >
              {mode === "signin" ? "Pas encore client ? Ouvrir un compte" : "Déjà client ? Se connecter"}
            </button>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Vos données sont protégées par chiffrement AES-256.<br/>
            Conformité AMF · FINTRAC · MiCA.
          </p>
        </div>
      </main>
    </div>
  );
}