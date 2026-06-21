import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, LogOut, CreditCard, ShieldCheck, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ValtisLogo } from "@/components/valtis/logo";
import { Button } from "@/components/ui/button";
import { useGhostMode } from "@/hooks/use-ghost-mode";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/cards")({
  head: () => ({ meta: [{ title: "Mes cartes · Valtis" }] }),
  component: CardsPage,
});

type Card = {
  id: string;
  holder_name: string;
  brand: string;
  card_number: string;
  cvv: string;
  expiry_month: number;
  expiry_year: number;
  tier: "standard" | "gold_plus";
  status: "active" | "blocked" | "expired";
};

function formatNumber(n: string) {
  return n.replace(/(.{4})/g, "$1 ").trim();
}

function CardsPage() {
  const navigate = useNavigate();
  const { ghost, toggle } = useGhostMode();
  const [userId, setUserId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const { data: cards } = useQuery({
    queryKey: ["cards", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cards")
        .select("id, holder_name, brand, card_number, cvv, expiry_month, expiry_year, tier, status")
        .eq("user_id", userId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Card[];
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
            <Link to="/wallets" className="text-muted-foreground hover:text-foreground">Portefeuilles</Link>
            <Link to="/cards" className="text-foreground">Cartes</Link>
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

      <main className="mx-auto max-w-7xl px-6 py-12 space-y-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Vos cartes</p>
          <h1 className="font-display text-4xl font-semibold tracking-tight">Cartes Valtis</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-lg">
            Chaque client reçoit une carte <span className="text-foreground">Standard</span> à l'ouverture du compte.
            La carte <span className="text-gold-gradient">Gold Plus</span> est activée par votre conseiller dès que votre patrimoine atteint 500 000 CAD.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {(cards ?? []).map((c) => {
            const isGold = c.tier === "gold_plus";
            const shown = reveal[c.id];
            const masked = ghost || !shown;
            return (
              <Link
                key={c.id}
                to="/cards/$cardId"
                params={{ cardId: c.id }}
                className={`${isGold ? "card-premium shimmer-gold" : "card-soft"} rounded-2xl p-6 aspect-[1.586/1] flex flex-col justify-between relative overflow-hidden block hover:scale-[1.01] transition`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className={`text-xs uppercase tracking-[0.25em] ${isGold ? "text-white/60" : "text-muted-foreground"}`}>{c.brand}</p>
                    <p className={`text-[10px] mt-1 uppercase tracking-widest ${isGold ? "text-gold-gradient" : "text-primary"}`}>
                      {isGold ? "Gold Plus" : "Standard"}
                    </p>
                  </div>
                  <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                    c.status === "active" ? "border-emerald-500/40 text-emerald-400" :
                    c.status === "blocked" ? "border-red-500/40 text-red-400" :
                    "border-muted-foreground/30 text-muted-foreground"
                  }`}>
                    {c.status === "active" ? "Active" : c.status === "blocked" ? "Bloquée" : "Expirée"}
                  </span>
                </div>
                <div className="space-y-3">
                  <p className={`font-mono text-lg tracking-[0.18em] ${isGold ? "text-white" : "text-foreground"}`}>
                    {masked ? "•••• •••• •••• " + c.card_number.slice(-4) : formatNumber(c.card_number)}
                  </p>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className={`text-[9px] uppercase tracking-widest ${isGold ? "text-white/50" : "text-muted-foreground"}`}>Titulaire</p>
                      <p className={`text-xs font-medium ${isGold ? "text-white" : "text-foreground"}`}>{c.holder_name.toUpperCase()}</p>
                    </div>
                    <div>
                      <p className={`text-[9px] uppercase tracking-widest ${isGold ? "text-white/50" : "text-muted-foreground"}`}>Exp.</p>
                      <p className={`text-xs font-mono ${isGold ? "text-white" : "text-foreground"}`}>
                        {String(c.expiry_month).padStart(2, "0")}/{String(c.expiry_year).slice(-2)}
                      </p>
                    </div>
                    <div>
                      <p className={`text-[9px] uppercase tracking-widest ${isGold ? "text-white/50" : "text-muted-foreground"}`}>CVV</p>
                      <p className={`text-xs font-mono ${isGold ? "text-white" : "text-foreground"}`}>{masked ? "•••" : c.cvv}</p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReveal((r) => ({ ...r, [c.id]: !r[c.id] })); }}
                  className={`absolute top-3 right-3 p-1.5 rounded-full transition ${isGold ? "bg-white/10 hover:bg-white/20 text-white" : "bg-muted hover:bg-muted/70 text-muted-foreground"}`}
                  title={shown ? "Masquer" : "Révéler"}
                >
                  {shown ? <Lock className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              </Link>
            );
          })}
        </div>

        {(cards ?? []).every((c) => c.tier === "standard") && (cards ?? []).length > 0 && (
          <div className="rounded-xl border border-gold/30 bg-gold/5 p-6 flex items-start gap-4">
            <ShieldCheck className="w-5 h-5 text-gold-gradient mt-0.5" />
            <div>
              <p className="font-display text-base font-semibold mb-1">Passez à la carte Gold Plus</p>
              <p className="text-sm text-muted-foreground">
                L'activation est gérée par votre conseiller Valtis dès que votre patrimoine global atteint 500 000 CAD.
              </p>
            </div>
          </div>
        )}

        {(cards ?? []).length === 0 && (
          <div className="rounded-xl border border-border bg-surface/30 p-12 text-center text-sm text-muted-foreground">
            <CreditCard className="w-6 h-6 mx-auto mb-3 opacity-60" />
            Aucune carte trouvée. Contactez votre conseiller.
          </div>
        )}
      </main>
    </div>
  );
}