import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, Lock, LogOut, History, ShieldCheck, Ban, CheckCircle2, Sparkles, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ValtisLogo } from "@/components/valtis/logo";
import { Button } from "@/components/ui/button";
import { useGhostMode } from "@/hooks/use-ghost-mode";

export const Route = createFileRoute("/_authenticated/cards/$cardId")({
  head: () => ({ meta: [{ title: "Détails carte · Valtis" }] }),
  component: CardDetail,
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
      {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Carte introuvable</div>
  ),
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
  created_at: string;
};

type HistoryEntry = {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  actor_id: string | null;
  actor_email: string | null;
  created_at: string;
};

function formatNumber(n: string) {
  return n.replace(/(.{4})/g, "$1 ").trim();
}

function actionLabel(action: string, meta: Record<string, unknown> | null): { label: string; tone: string } {
  if (action === "card.status_changed") {
    const s = String(meta?.new_status ?? "");
    if (s === "active") return { label: "Carte réactivée", tone: "text-emerald-400" };
    if (s === "blocked") return { label: "Carte gelée", tone: "text-red-400" };
    return { label: `Statut → ${s}`, tone: "text-muted-foreground" };
  }
  if (action === "card.tier_changed") {
    const t = String(meta?.new_tier ?? "");
    if (t === "gold_plus") return { label: "Passage en Gold Plus", tone: "text-gold-gradient" };
    return { label: "Retour en Standard", tone: "text-foreground" };
  }
  return { label: action, tone: "text-muted-foreground" };
}

function CardDetail() {
  const { cardId } = Route.useParams();
  const navigate = useNavigate();
  const { ghost, toggle } = useGhostMode();
  const [userId, setUserId] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const { data: card, isLoading } = useQuery({
    queryKey: ["card", cardId, userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cards")
        .select("id, holder_name, brand, card_number, cvv, expiry_month, expiry_year, tier, status, created_at")
        .eq("id", cardId)
        .maybeSingle();
      if (error) throw error;
      return data as Card | null;
    },
  });

  const { data: history } = useQuery({
    queryKey: ["card-history", cardId],
    enabled: !!userId && !!card,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("card_history", { _card_id: cardId });
      if (error) throw error;
      return (data ?? []) as HistoryEntry[];
    },
  });

  async function handleSignOut() {
    await supabase.auth.signOut();
    toast.success("Déconnecté");
    navigate({ to: "/auth", replace: true });
  }

  const isGold = card?.tier === "gold_plus";
  const masked = ghost || !reveal;

  const statusEvents = (history ?? []).filter((h) => h.action === "card.status_changed" || h.action === "card.tier_changed");
  const lastAdmin = statusEvents[0];

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
            <Button variant="ghost" size="sm" onClick={toggle}>{ghost ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</Button>
            <Button variant="ghost" size="sm" onClick={handleSignOut}><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
        <Link to="/cards" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Toutes mes cartes
        </Link>

        {isLoading && <div className="text-sm text-muted-foreground">Chargement…</div>}
        {!isLoading && !card && (
          <div className="rounded-xl border border-border bg-surface/30 p-12 text-center text-sm text-muted-foreground">
            <CreditCard className="w-6 h-6 mx-auto mb-3 opacity-60" />
            Carte introuvable ou accès refusé.
          </div>
        )}

        {card && (
          <div className="grid lg:grid-cols-[1.1fr_1fr] gap-8">
            <div className="space-y-5">
              <div className={`${isGold ? "card-premium shimmer-gold" : "card-soft"} rounded-2xl p-6 aspect-[1.586/1] flex flex-col justify-between relative overflow-hidden`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className={`text-xs uppercase tracking-[0.25em] ${isGold ? "text-white/60" : "text-muted-foreground"}`}>{card.brand}</p>
                    <p className={`text-[10px] mt-1 uppercase tracking-widest ${isGold ? "text-gold-gradient" : "text-primary"}`}>
                      {isGold ? "Gold Plus" : "Standard"}
                    </p>
                  </div>
                  <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                    card.status === "active" ? "border-emerald-500/40 text-emerald-400" :
                    card.status === "blocked" ? "border-red-500/40 text-red-400" :
                    "border-muted-foreground/30 text-muted-foreground"
                  }`}>
                    {card.status === "active" ? "Active" : card.status === "blocked" ? "Gelée" : "Expirée"}
                  </span>
                </div>
                <div className="space-y-3">
                  <p className={`font-mono text-lg tracking-[0.18em] ${isGold ? "text-white" : "text-foreground"}`}>
                    {masked ? "•••• •••• •••• " + card.card_number.slice(-4) : formatNumber(card.card_number)}
                  </p>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className={`text-[9px] uppercase tracking-widest ${isGold ? "text-white/50" : "text-muted-foreground"}`}>Titulaire</p>
                      <p className={`text-xs font-medium ${isGold ? "text-white" : "text-foreground"}`}>{card.holder_name.toUpperCase()}</p>
                    </div>
                    <div>
                      <p className={`text-[9px] uppercase tracking-widest ${isGold ? "text-white/50" : "text-muted-foreground"}`}>Exp.</p>
                      <p className={`text-xs font-mono ${isGold ? "text-white" : "text-foreground"}`}>
                        {String(card.expiry_month).padStart(2, "0")}/{String(card.expiry_year).slice(-2)}
                      </p>
                    </div>
                    <div>
                      <p className={`text-[9px] uppercase tracking-widest ${isGold ? "text-white/50" : "text-muted-foreground"}`}>CVV</p>
                      <p className={`text-xs font-mono ${isGold ? "text-white" : "text-foreground"}`}>{masked ? "•••" : card.cvv}</p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setReveal((r) => !r)}
                  className={`absolute top-3 right-3 p-1.5 rounded-full transition ${isGold ? "bg-white/10 hover:bg-white/20 text-white" : "bg-muted hover:bg-muted/70 text-muted-foreground"}`}
                  title={reveal ? "Masquer" : "Révéler"}
                >
                  {reveal ? <Lock className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              </div>

              <div className="rounded-xl border border-border bg-surface/40 p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <span className="font-medium">Dernière action administrateur</span>
                </div>
                {lastAdmin ? (
                  <div className="text-sm space-y-1">
                    <p className={actionLabel(lastAdmin.action, lastAdmin.metadata).tone}>
                      {actionLabel(lastAdmin.action, lastAdmin.metadata).label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(lastAdmin.created_at).toLocaleString("fr-CA")} · {lastAdmin.actor_email ?? "système"}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Aucune intervention administrative depuis l'émission.</p>
                )}
                <div className="pt-2 text-xs text-muted-foreground">
                  Émise le {new Date(card.created_at).toLocaleDateString("fr-CA")}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface/40 p-5">
              <div className="flex items-center gap-2 mb-4">
                <History className="w-4 h-4 text-primary" />
                <h2 className="font-display text-lg font-semibold">Historique des statuts</h2>
              </div>
              {(history ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun événement enregistré.</p>
              ) : (
                <ol className="relative border-l border-border/60 ml-2 space-y-5">
                  {(history ?? []).map((h) => {
                    const lbl = actionLabel(h.action, h.metadata);
                    const icon = h.action === "card.status_changed"
                      ? (String(h.metadata?.new_status) === "blocked" ? <Ban className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />)
                      : <Sparkles className="w-3 h-3" />;
                    return (
                      <li key={h.id} className="ml-4">
                        <span className="absolute -left-[7px] mt-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background border border-border text-muted-foreground">
                          {icon}
                        </span>
                        <p className={`text-sm font-medium ${lbl.tone}`}>{lbl.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(h.created_at).toLocaleString("fr-CA")} · {h.actor_email ?? "système"}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}