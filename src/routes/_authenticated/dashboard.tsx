import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, LogOut, ArrowUpRight, ArrowDownLeft, Shield, Sparkles, CreditCard, Wallet as WalletIcon, Copy, Check, Loader2, AlertTriangle, CheckCircle2, Lock, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ValtisLogo } from "@/components/valtis/logo";
import { NotificationsBell } from "@/components/valtis/notifications-bell";
import { KycDialog } from "@/components/valtis/kyc-dialog";
import { IncomingTransfersTracker } from "@/components/valtis/incoming-transfers-tracker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
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

type StepStatus = "pending" | "running" | "done" | "blocked";
type VerifStep = { key: string; label: string; pct: number; status: StepStatus };

const BASE_STEPS: Omit<VerifStep, "status">[] = [
  { key: "auth", label: "Authentification renforcée du donneur d'ordre", pct: 12 },
  { key: "wallet", label: "Vérification du portefeuille source", pct: 25 },
  { key: "aml", label: "Contrôle anti-blanchiment (AML / CFT)", pct: 38 },
  { key: "benef", label: "Validation du bénéficiaire & sanctions", pct: 50 },
  { key: "edd", label: "Conformité approfondie (EDD)", pct: 63 },
  { key: "reserve", label: "Réservation des fonds", pct: 75 },
  { key: "route", label: "Routage SWIFT / SEPA", pct: 88 },
  { key: "confirm", label: "Confirmation finale", pct: 100 },
];

const COMPLIANCE_CODE = "VALTIS-2026";

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { ghost, toggle } = useGhostMode();
  const [userId, setUserId] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [kycOpen, setKycOpen] = useState(false);
  const [transferId, setTransferId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [transferFrom, setTransferFrom] = useState<string>("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferRef, setTransferRef] = useState("");
  // Verification simulation state
  const [phase, setPhase] = useState<"form" | "verifying" | "blocked" | "success">("form");
  const [steps, setSteps] = useState<VerifStep[]>([]);
  const [progress, setProgress] = useState(0);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [unlockCode, setUnlockCode] = useState("");
  const [unlocking, setUnlocking] = useState(false);

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
    setPhase("form");
    setSteps([]);
    setProgress(0);
    setBlockReason(null);
    setUnlockCode("");
    setTransferId(null);
    setTransferOpen(true);
  }

  function evaluateBlockReason(amount: number, recipient: string, kyc: string): string | null {
    if (kyc !== "approved" && kyc !== "verified") {
      return "Votre dossier KYC n'est pas encore approuvé par notre cellule conformité. Une vérification renforcée est requise avant tout virement sortant.";
    }
    const r = recipient.trim();
    const isTag = r.startsWith("@") && r.length >= 3;
    const isIban = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/i.test(r.replace(/\s+/g, ""));
    if (!isTag && !isIban) {
      return "Le bénéficiaire n'est pas reconnu (tag Valtis ou IBAN attendu). Le contrôle sanctions et listes PEP a échoué.";
    }
    if (amount >= 10000) {
      return "Virement à montant élevé (≥ 10 000). Un code de déblocage conformité (EDD) est obligatoire — contactez votre gestionnaire dédié.";
    }
    return null;
  }

  async function runVerification(reason: string | null, tId: string | null) {
    // Build fresh step list
    const list: VerifStep[] = BASE_STEPS.map((s) => ({ ...s, status: "pending" }));
    setSteps(list);
    setProgress(0);

    for (let i = 0; i < list.length; i++) {
      // mark running
      list[i] = { ...list[i], status: "running" };
      setSteps([...list]);
      // animate progress towards this step's pct
      const prevPct = i === 0 ? 0 : list[i - 1].pct;
      const targetPct = list[i].pct;
      const ticks = 14;
      for (let t = 1; t <= ticks; t++) {
        await new Promise((r) => setTimeout(r, 55));
        setProgress(prevPct + ((targetPct - prevPct) * t) / ticks);
      }
      if (tId) {
        await supabase.rpc("update_transfer_progress" as never, { _id: tId, _progress: list[i].pct, _step: list[i].key } as never);
      }
      // EDD gate at 63%
      if (list[i].key === "edd" && reason) {
        list[i] = { ...list[i], status: "blocked" };
        setSteps([...list]);
        setProgress(63);
        setBlockReason(reason);
        setPhase("blocked");
        if (tId) await supabase.rpc("block_transfer" as never, { _id: tId, _reason: reason } as never);
        return;
      }
      list[i] = { ...list[i], status: "done" };
      setSteps([...list]);
    }
    setProgress(100);
    if (tId) await supabase.rpc("complete_transfer" as never, { _id: tId } as never);
    qc.invalidateQueries({ queryKey: ["wallets"] });
    setPhase("success");
  }

  async function startTransfer(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(transferAmount);
    if (!transferFrom) return toast.error("Sélectionnez un portefeuille");
    if (!transferTo.trim()) return toast.error("Destinataire requis");
    if (!amount || amount <= 0) return toast.error("Montant invalide");
    const w = (wallets ?? []).find((x) => x.id === transferFrom);
    if (!w) return toast.error("Portefeuille introuvable");
    if (amount > Number(w.balance)) return toast.error("Solde insuffisant");
    const reason = evaluateBlockReason(amount, transferTo, profile?.kyc_status ?? "pending");
    setPhase("verifying");
    // Create the transfer record server-side (notifies sender + recipient if known)
    const { data: tId, error } = await supabase.rpc("start_transfer" as never, {
      _from_wallet: transferFrom,
      _recipient: transferTo.trim(),
      _amount: amount,
      _reference: transferRef || null,
    } as never);
    if (error) {
      toast.error(error.message);
      setPhase("form");
      return;
    }
    const id = (tId as unknown) as string;
    setTransferId(id);
    void runVerification(reason, id);
  }

  async function submitUnlock() {
    setUnlocking(true);
    await new Promise((r) => setTimeout(r, 700));
    if (unlockCode.trim().toUpperCase() !== COMPLIANCE_CODE) {
      setUnlocking(false);
      toast.error("Code de déblocage invalide", { description: "Contactez votre gestionnaire dédié." });
      return;
    }
    setUnlocking(false);
    // Resume from EDD step
    const list = steps.map((s) =>
      s.key === "edd" ? { ...s, status: "done" as StepStatus } : s,
    );
    setSteps(list);
    setBlockReason(null);
    setPhase("verifying");
    // continue remaining steps
    const remaining = BASE_STEPS.findIndex((s) => s.key === "edd") + 1;
    const tail: VerifStep[] = [...list];
    for (let i = remaining; i < tail.length; i++) {
      tail[i] = { ...tail[i], status: "running" };
      setSteps([...tail]);
      const prevPct = tail[i - 1].pct;
      const targetPct = tail[i].pct;
      const ticks = 14;
      for (let t = 1; t <= ticks; t++) {
        await new Promise((r) => setTimeout(r, 55));
        setProgress(prevPct + ((targetPct - prevPct) * t) / ticks);
      }
      if (transferId) {
        await supabase.rpc("update_transfer_progress" as never, { _id: transferId, _progress: tail[i].pct, _step: tail[i].key } as never);
      }
      tail[i] = { ...tail[i], status: "done" };
      setSteps([...tail]);
    }
    setProgress(100);
    if (transferId) await supabase.rpc("complete_transfer" as never, { _id: transferId } as never);
    qc.invalidateQueries({ queryKey: ["wallets"] });
    setPhase("success");
  }

  function closeTransferDialog() {
    setTransferOpen(false);
    if (phase === "success") {
      const w = (wallets ?? []).find((x) => x.id === transferFrom);
      toast.success(
        `Transfert de ${parseFloat(transferAmount).toLocaleString("fr-CA")} ${w?.currency ?? ""} confirmé vers ${transferTo}`,
        { description: "Reçu disponible dans votre historique conformité." },
      );
    }
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
            <NotificationsBell userId={userId} />
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-12 space-y-10">
        {profile && profile.kyc_status !== "approved" && profile.kyc_status !== "verified" && (
          <div className="rounded-xl border border-gold/40 bg-gold/5 p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-gold-gradient mt-0.5" />
              <div>
                <p className="text-sm font-medium">
                  Vérification KYC {profile.kyc_status === "review" ? "en cours d'examen" : "requise"}
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                  {profile.kyc_status === "review"
                    ? "Votre dossier a été reçu. Un administrateur va le valider, votre carte standard sera alors activée automatiquement."
                    : "Soumettez votre dossier KYC pour activer votre carte standard et lever les restrictions sur vos virements."}
                </p>
              </div>
            </div>
            {profile.kyc_status !== "review" && (
              <Button variant="gold" onClick={() => setKycOpen(true)}>
                <ShieldCheck className="w-4 h-4" /> Soumettre mon KYC
              </Button>
            )}
          </div>
        )}

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
        </section>
        <IncomingTransfersTracker userId={userId} />
        <section>
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

      <Dialog open={transferOpen} onOpenChange={(o) => (o ? setTransferOpen(true) : closeTransferDialog())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {phase === "form" && "Nouveau transfert"}
              {phase === "verifying" && "Vérification en cours"}
              {phase === "blocked" && "Transfert suspendu"}
              {phase === "success" && "Transfert confirmé"}
            </DialogTitle>
            <DialogDescription>
              {phase === "form" && "Envoyez des fonds vers un autre client Valtis ou un IBAN."}
              {phase === "verifying" && "Notre moteur conformité valide chaque étape en temps réel."}
              {phase === "blocked" && "Une étape de conformité requiert votre attention."}
              {phase === "success" && "Toutes les vérifications ont été franchies avec succès."}
            </DialogDescription>
          </DialogHeader>

          {phase === "form" && (
          <form onSubmit={startTransfer} className="space-y-4">
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
              <Button type="button" variant="ghost" onClick={closeTransferDialog}>Annuler</Button>
              <Button type="submit" variant="gold">Lancer la vérification</Button>
            </DialogFooter>
          </form>
          )}

          {(phase === "verifying" || phase === "blocked" || phase === "success") && (
            <div className="space-y-5">
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-muted-foreground">Progression conformité</span>
                  <span className={phase === "blocked" ? "text-destructive font-semibold" : "text-gold-gradient font-semibold"}>
                    {Math.round(progress)}%
                  </span>
                </div>
                <Progress value={progress} className={phase === "blocked" ? "[&>div]:bg-destructive" : ""} />
              </div>
              <ul className="space-y-2">
                {steps.map((s) => (
                  <li key={s.key} className="flex items-center gap-3 text-sm">
                    <span className="w-5 h-5 flex items-center justify-center">
                      {s.status === "done" && <CheckCircle2 className="w-4 h-4 text-primary" />}
                      {s.status === "running" && <Loader2 className="w-4 h-4 animate-spin text-gold" />}
                      {s.status === "blocked" && <AlertTriangle className="w-4 h-4 text-destructive" />}
                      {s.status === "pending" && <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />}
                    </span>
                    <span className={s.status === "pending" ? "text-muted-foreground" : "text-foreground"}>
                      {s.label}
                    </span>
                    <span className="ml-auto text-[11px] text-muted-foreground">{s.pct}%</span>
                  </li>
                ))}
              </ul>

              {phase === "blocked" && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
                  <div className="flex gap-2 items-start">
                    <Lock className="w-4 h-4 text-destructive mt-0.5" />
                    <p className="text-sm text-destructive">{blockReason}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unlock" className="text-xs">Code de déblocage conformité</Label>
                    <Input
                      id="unlock"
                      placeholder="VALTIS-XXXX"
                      value={unlockCode}
                      onChange={(e) => setUnlockCode(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Ce code vous est transmis par votre gestionnaire après revue du dossier EDD.
                    </p>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={closeTransferDialog}>Abandonner</Button>
                    <Button variant="gold" size="sm" onClick={submitUnlock} disabled={unlocking || !unlockCode}>
                      {unlocking ? "Vérification…" : "Débloquer"}
                    </Button>
                  </div>
                </div>
              )}

              {phase === "success" && (
                <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm flex gap-2 items-start">
                  <CheckCircle2 className="w-4 h-4 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Virement exécuté</p>
                    <p className="text-muted-foreground text-xs mt-1">
                      Référence : VLT-{Date.now().toString(36).toUpperCase()} — fonds routés vers {transferTo}.
                    </p>
                  </div>
                </div>
              )}

              {phase === "success" && (
                <DialogFooter>
                  <Button variant="gold" onClick={closeTransferDialog}>Fermer</Button>
                </DialogFooter>
              )}
            </div>
          )}
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

      <KycDialog open={kycOpen} onOpenChange={setKycOpen} defaultName={profile?.full_name ?? ""} />
    </div>
  );
}