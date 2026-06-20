import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ValtisLogo } from "@/components/valtis/logo";
import { ArrowLeft, Loader2 } from "lucide-react";

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
        if (signUpData.session) {
          toast.success("Compte créé. Bienvenue chez Valtis.");
          navigate({ to: "/dashboard" });
        } else {
          toast.success("Compte créé. Vérifiez votre e-mail pour confirmer.");
          setMode("signin");
        }
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
              {mode === "signin" ? "Accès privé" : "Ouvrir un compte Valtis"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "signin" ? "Connectez-vous à votre espace bancaire." : "Quelques secondes pour commencer."}
            </p>
          </div>

          <div className="card-premium rounded-2xl p-8 space-y-5">

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

            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
            >
              {mode === "signin" ? "Pas encore client ? Ouvrir un compte" : "Déjà client ? Se connecter"}
            </button>
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