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
import { useTranslation } from "react-i18next";

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

function AuthPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { mode: initialMode } = Route.useSearch();
  const schema = z.object({
    email: z.string().trim().email(t("adresse_email_invalide")).max(255),
    password: z.string().min(8, t("au_moins_8_caracteres")).max(128),
    fullName: z.string().trim().max(100).optional(),
  });
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
      toast.error(parsed.error.issues[0]?.message ?? t("donnees_invalides"));
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
        toast.success(t("email_confirmation_envoye"));
        setStep("check-email");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
        toast.success(t("connexion_reussie"));
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("erreur_authentification");
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
      toast.success(t("nouvel_email_confirmation_envoye"));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("impossible_renvoyer_email");
      toast.error(message);
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 h-16 flex items-center justify-between max-w-7xl mx-auto w-full">
        <Link to="/" className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> {t("retour")}
        </Link>
        <ValtisLogo />
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <h1 className="font-display text-3xl font-semibold tracking-tight mb-2">
              {step === "check-email"
                ? t("verifiez_votre_boite_mail")
                : mode === "signin"
                ? t("acces_prive")
                : t("ouvrir_un_compte_valtis")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {step === "check-email"
                ? t("email_confirmation_envoye_a", { email })
                : mode === "signin"
                ? t("connectez_vous_a_votre_espace")
                : t("quelques_secondes_pour_commencer")}
            </p>
          </div>

          <div className="card-premium rounded-2xl p-8 space-y-5">
            {step === "credentials" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-xs uppercase tracking-wider text-muted-foreground">{t("nom_complet")}</Label>
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11" />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">{t("e-mail")}</Label>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">{t("mot_de_passe")}</Label>
                <Input id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11" />
              </div>
              <Button type="submit" variant="gold" className="w-full h-11" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {mode === "signin" ? t("se_connecter") : t("creer_mon_compte")}
              </Button>
            </form>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col items-center text-center gap-3 py-2">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <MailCheck className="w-7 h-7 text-primary" />
                  </div>
                  <p className="text-sm text-foreground">
                    {t("ouvrez_le-mail_que_nous_venons")} <span className="font-medium">{t("confirmer_mon_adresse")}</span> {t("pour_activer_votre_compte_valtis")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("pensez_a_verifier_vos_courriers")}
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
                  {t("renvoyer_le-mail_de_confirmation")}
                </Button>
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => setStep("credentials")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {t("modifier_le-mail")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setStep("credentials");
                    }}
                    className="text-primary hover:underline"
                  >
                    {t("jai_confirme_me_connecter")}
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
              {mode === "signin" ? t("pas_encore_client_ouvrir_compte") : t("deja_client_se_connecter")}
            </button>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center mt-6">
            {t("vos_donnees_sont_protegees_par")}<br/>
            {t("conformite_amf_fintrac_mica")}
          </p>
        </div>
      </main>
    </div>
  );
}