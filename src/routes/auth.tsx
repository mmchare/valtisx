import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ValtisLogo } from "@/components/valtis/logo";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@/components/ui/input-otp";

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
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    setStep("credentials");
    setOtp("");
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
        const { data: signUpData, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: parsed.data.fullName ?? "" },
          },
        });
        if (error) throw error;
        toast.success("Un code à 6 chiffres a été envoyé à votre e-mail.");
        setResendIn(30);
        setStep("otp");
        void signUpData;
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

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error("Saisissez les 6 chiffres du code.");
      return;
    }
    setOtpLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: "email",
      });
      if (error) {
        toast.error(error.message || "Code incorrect ou expiré.");
        return;
      }
      toast.success("Inscription finalisée.");
      navigate({ to: "/dashboard" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Vérification impossible";
      toast.error(message);
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleResend() {
    if (resendIn > 0) return;
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      toast.success("Nouveau code envoyé à votre e-mail.");
      setResendIn(30);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossible de renvoyer le code";
      toast.error(message);
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
              {step === "otp"
                ? "Vérification en deux étapes"
                : mode === "signin"
                ? "Accès privé"
                : "Ouvrir un compte Valtis"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {step === "otp"
                ? `Entrez le code à 6 chiffres envoyé à ${email}.`
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
              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  Sécurisé par authentification à deux facteurs
                </div>
                <div className="flex justify-center py-2">
                  <InputOTP maxLength={6} value={otp} onChange={setOtp} autoFocus>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button type="submit" variant="gold" className="w-full h-11" disabled={otpLoading || otp.length !== 6}>
                  {otpLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Vérifier le code
                </Button>
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("credentials");
                      setOtp("");
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ← Modifier l'e-mail
                  </button>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendIn > 0}
                    className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                  >
                    {resendIn > 0 ? `Renvoyer dans ${resendIn}s` : "Renvoyer le code"}
                  </button>
                </div>
              </form>
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