import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, LogOut, ArrowUpRight, ArrowDownLeft, Shield, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ValtisLogo } from "@/components/valtis/logo";
import { Button } from "@/components/ui/button";
import { useGhostMode, formatAmount } from "@/hooks/use-ghost-mode";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Tableau de bord · Valtis" }] }),
  component: Dashboard,
});

type Wallet = {
  id: string;
  currency: "CAD" | "EUR" | "USD";
  balance: number;
  label: string | null;
  is_primary: boolean;
};
type Profile = { full_name: string | null; email: string; kyc_status: string };

function Dashboard() {
  const navigate = useNavigate();
  const { ghost, toggle } = useGhostMode();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const { data: profile } = useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, email, kyc_status")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });

  const { data: wallets } = useQuery({
    queryKey: ["wallets", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallets")
        .select("id, currency, balance, label, is_primary")
        .eq("user_id", userId!)
        .order("is_primary", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Wallet[];
    },
  });

  async function handleSignOut() {
    await supabase.auth.signOut();
    toast.success("Déconnecté");
    navigate({ to: "/auth", replace: true });
  }

  const totalCad = (wallets ?? []).reduce((acc, w) => {
    const rates: Record<string, number> = { CAD: 1, EUR: 1.48, USD: 1.36 };
    return acc + Number(w.balance) * (rates[w.currency] ?? 1);
  }, 0);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/40 sticky top-0 z-40 backdrop-blur-sm bg-background/70">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <ValtisLogo />
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link to="/dashboard" className="text-foreground">Accueil</Link>
            <Link to="/wallets" className="text-muted-foreground hover:text-foreground">Portefeuilles</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={toggle} title="Ghost Mode">
              {ghost ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-12 space-y-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Patrimoine global</p>
            <h1 className="font-display text-5xl font-semibold tracking-tight">
              {formatAmount(totalCad, "CAD", ghost)}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Bonjour {profile?.full_name || profile?.email?.split("@")[0] || "client"} · Statut KYC : <span className="text-primary capitalize">{profile?.kyc_status ?? "pending"}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="gold">
              <ArrowUpRight className="w-4 h-4" /> Nouveau transfert
            </Button>
            <Button variant="ghost-gold">
              <ArrowDownLeft className="w-4 h-4" /> Recevoir
            </Button>
          </div>
        </div>

        <section>
          <h2 className="font-display text-xl mb-5 text-muted-foreground">Vos portefeuilles</h2>
          <div className="grid md:grid-cols-2 gap-5">
            {(wallets ?? []).map((w) => (
              <div key={w.id} className="card-premium shimmer-gold rounded-2xl p-6 aspect-[2.2/1] flex flex-col justify-between animate-fade-in-up">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{w.label}</p>
                    <p className="text-xs text-primary mt-1">{w.currency}</p>
                  </div>
                  {w.is_primary && (
                    <span className="text-[10px] uppercase tracking-widest border border-gold px-2 py-0.5 rounded-full text-primary">
                      Principal
                    </span>
                  )}
                </div>
                <div>
                  <p className="font-display text-3xl font-semibold text-foreground">
                    {formatAmount(Number(w.balance), w.currency, ghost)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 tracking-wider">
                    •••• •••• •••• {w.id.slice(-4).toUpperCase()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-5">
          <div className="p-6 rounded-xl border border-border bg-surface/40">
            <Shield className="w-5 h-5 text-primary mb-3" />
            <h3 className="font-display font-semibold mb-1">Conformité active</h3>
            <p className="text-sm text-muted-foreground">Vos transactions sont surveillées par notre cellule EDD 24/7.</p>
          </div>
          <div className="p-6 rounded-xl border border-border bg-surface/40">
            <Sparkles className="w-5 h-5 text-primary mb-3" />
            <h3 className="font-display font-semibold mb-1">Ghost Mode</h3>
            <p className="text-sm text-muted-foreground">Masquez vos soldes d'un geste pour préserver votre discrétion.</p>
          </div>
          <div className="p-6 rounded-xl border border-border bg-surface/40">
            <ArrowUpRight className="w-5 h-5 text-primary mb-3" />
            <h3 className="font-display font-semibold mb-1">Transferts P2P</h3>
            <p className="text-sm text-muted-foreground">Bientôt disponible : virements en temps réel avec jauge de progression.</p>
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl mb-5 text-muted-foreground">Activité récente</h2>
          <div className="rounded-xl border border-border bg-surface/30 p-12 text-center text-sm text-muted-foreground">
            Aucune transaction pour le moment. Les flux apparaîtront ici en temps réel.
          </div>
        </section>
      </main>
    </div>
  );
}