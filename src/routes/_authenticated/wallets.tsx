import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, LogOut } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ValtisLogo } from "@/components/valtis/logo";
import { Button } from "@/components/ui/button";
import { useGhostMode, formatAmount } from "@/hooks/use-ghost-mode";

export const Route = createFileRoute("/_authenticated/wallets")({
  head: () => ({ meta: [{ title: "Portefeuilles · Valtis" }] }),
  component: Wallets,
});

type Wallet = { id: string; currency: "CAD" | "EUR" | "USD"; balance: number; label: string | null; is_primary: boolean };

function Wallets() {
  const navigate = useNavigate();
  const { ghost, toggle } = useGhostMode();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const { data: wallets } = useQuery({
    queryKey: ["wallets", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallets")
        .select("id, currency, balance, label, is_primary")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []) as Wallet[];
    },
  });

  async function handleSignOut() {
    await supabase.auth.signOut();
    toast.success("Déconnecté");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/40 sticky top-0 z-40 backdrop-blur-sm bg-background/70">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <ValtisLogo />
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">Accueil</Link>
            <Link to="/wallets" className="text-foreground">Portefeuilles</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={toggle}>
              {ghost ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="font-display text-4xl font-semibold mb-8">Portefeuilles</h1>
        <div className="space-y-4">
          {(wallets ?? []).map((w) => (
            <div key={w.id} className="card-premium rounded-2xl p-6 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{w.label}</p>
                <p className="font-display text-2xl mt-1">{formatAmount(Number(w.balance), w.currency, ghost)}</p>
              </div>
              <div className="text-right">
                <span className="text-xs uppercase tracking-widest text-primary">{w.currency}</span>
                {w.is_primary && <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Principal</p>}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}