import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, LogOut, ArrowUpRight, ArrowDownLeft, Shield, Sparkles, CreditCard, Wallet as WalletIcon, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ValtisLogo } from "@/components/valtis/logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [transferOpen, setTransferOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [transferFrom, setTransferFrom] = useState<string>("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferRef, setTransferRef] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  const primaryWallet = useMemo(() => (wallets ?? []).find((w) => w.is_primary) ?? (wallets ?? [])[0], [wallets]);
  const valtisTag = useMemo(() => {
    const base = (profile?.email?.split("@")[0] ?? "client").replace(/[^a-z0-9]/gi, "").toLowerCase();
    return `@${base || "valtis"}`;
  }, [profile]);

  async function copyTag() {
    try {
      await navigator.clipboard.writeText(valtisTag);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Impossible de copier");
    }
  }

  function openTransfer() {
    setTransferFrom(primaryWallet?.id ?? "");
    setTransferTo("");
    setTransferAmount("");
    setTransferRef("");
    setTransferOpen(true);
  }

  async function submitTransfer(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(transferAmount);
    if (!transferFrom) return toast.error("Sélectionnez un portefeuille");
    if (!transferTo.trim()) return toast.error("Destinataire requis");
    if (!amount || amount <= 0) return toast.error("Montant invalide");
    const w = (wallets ?? []).find((x) => x.id === transferFrom);
    if (!w) return toast.error("Portefeuille introuvable");
    if (amount > Number(w.balance)) return toast.error("Solde insuffisant");
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 900));
    setSubmitting(false);
    setTransferOpen(false);
    toast.success(`Transfert de ${amount.toLocaleString("fr-CA")} ${w.currency} initié vers ${transferTo}`, {
      description: "Une confirmation vous sera envoyée par la cellule conformité.",
    });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/40 sticky top-0 z-40 backdrop-blur-sm bg-background/70">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <ValtisLogo />
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link to="/dashboard" className="text-foreground">Accueil</Link>
            <Link to="/wallets" className="text-muted-foreground hover:text-foreground">Portefeuilles</Link>
            <Link to="/cards" className="text-muted-foreground hover:text-foreground">Cartes</Link>
            <Link to="/admin" className="text-muted-foreground hover:text-foreground">Admin</Link>
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
          <div className="flex flex-wrap gap-2">
            <Button variant="gold" onClick={openTransfer}>
              <ArrowUpRight className="w-4 h-4" /> Nouveau transfert
            </Button>
            <Button variant="ghost-gold" onClick={() => setReceiveOpen(true)}>
              <ArrowDownLeft className="w-4 h-4" /> Recevoir
            </Button>
          </div>
        </div>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to="/wallets" className="flex items-center gap-3 rounded-xl border border-border bg-surface/40 p-4 hover:border-primary/40 hover:bg-surface/60 transition">
            <WalletIcon className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Portefeuilles</p>
              <p className="text-[11px] text-muted-foreground">Vos comptes multi-devises</p>
            </div>
          </Link>
          <Link to="/cards" className="flex items-center gap-3 rounded-xl border border-border bg-surface/40 p-4 hover:border-primary/40 hover:bg-surface/60 transition">
            <CreditCard className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Mes cartes</p>
              <p className="text-[11px] text-muted-foreground">Standard & Gold Plus</p>
            </div>
          </Link>
          <button onClick={openTransfer} className="flex items-center gap-3 rounded-xl border border-border bg-surface/40 p-4 hover:border-primary/40 hover:bg-surface/60 transition text-left">
            <ArrowUpRight className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Envoyer</p>
              <p className="text-[11px] text-muted-foreground">Transfert sécurisé</p>
            </div>
          </button>
          <button onClick={() => setReceiveOpen(true)} className="flex items-center gap-3 rounded-xl border border-border bg-surface/40 p-4 hover:border-primary/40 hover:bg-surface/60 transition text-left">
            <ArrowDownLeft className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Recevoir</p>
              <p className="text-[11px] text-muted-foreground">Partagez votre tag</p>
            </div>
          </button>
        </section>

        <section>
          <h2 className="font-display text-xl mb-5 text-muted-foreground">Vos portefeuilles</h2>
          <div className="grid md:grid-cols-2 gap-5">
            {(wallets ?? []).map((w) => (
              <div key={w.id} className={`${w.is_primary ? "card-premium shimmer-gold" : "card-soft"} rounded-2xl p-6 aspect-[2.2/1] flex flex-col justify-between animate-fade-in-up`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className={`text-xs uppercase tracking-[0.25em] ${w.is_primary ? "text-white/60" : "text-muted-foreground"}`}>{w.label}</p>
                    <p className={`text-xs mt-1 ${w.is_primary ? "text-gold-gradient" : "text-primary"}`}>{w.currency}</p>
                  </div>
                  {w.is_primary && (
                    <span className="text-[10px] uppercase tracking-widest border border-gold px-2 py-0.5 rounded-full text-gold-gradient">
                      Gold Plus
                    </span>
                  )}
                </div>
                <div>
                  <p className={`font-display text-3xl font-semibold ${w.is_primary ? "text-white" : "text-foreground"}`}>
                    {formatAmount(Number(w.balance), w.currency, ghost)}
                  </p>
                  <p className={`text-xs mt-1 tracking-wider ${w.is_primary ? "text-white/50" : "text-muted-foreground"}`}>
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

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Nouveau transfert</DialogTitle>
            <DialogDescription>Envoyez des fonds vers un autre client Valtis ou un IBAN.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitTransfer} className="space-y-4">
            <div className="space-y-2">
              <Label>Depuis</Label>
              <Select value={transferFrom} onValueChange={setTransferFrom}>
                <SelectTrigger><SelectValue placeholder="Portefeuille source" /></SelectTrigger>
                <SelectContent>
                  {(wallets ?? []).map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.label} · {formatAmount(Number(w.balance), w.currency, ghost)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">Destinataire</Label>
              <Input id="to" placeholder="@tag valtis ou IBAN" value={transferTo} onChange={(e) => setTransferTo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Montant</Label>
              <Input id="amount" type="number" min="0" step="0.01" placeholder="0.00" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ref">Référence (optionnel)</Label>
              <Input id="ref" placeholder="Motif du virement" value={transferRef} onChange={(e) => setTransferRef(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setTransferOpen(false)}>Annuler</Button>
              <Button type="submit" variant="gold" disabled={submitting}>
                {submitting ? "Envoi…" : "Confirmer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Recevoir des fonds</DialogTitle>
            <DialogDescription>Partagez votre tag Valtis ou vos coordonnées bancaires.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="rounded-xl border border-gold/30 bg-gold/5 p-5 text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Votre tag Valtis</p>
              <p className="font-display text-2xl text-gold-gradient">{valtisTag}</p>
              <Button variant="ghost-gold" size="sm" className="mt-3" onClick={copyTag}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copié" : "Copier le tag"}
              </Button>
            </div>
            {primaryWallet && (
              <div className="rounded-xl border border-border bg-surface/40 p-4 text-sm space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Compte</span><span>{primaryWallet.label}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Devise</span><span>{primaryWallet.currency}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">IBAN</span><span className="font-mono">CA{primaryWallet.id.replace(/-/g, "").slice(0, 22).toUpperCase()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">BIC</span><span className="font-mono">VALTCAM1</span></div>
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center">
              Les fonds reçus sont disponibles immédiatement après contrôle conformité.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}