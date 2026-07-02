import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  LogOut,
  ShieldCheck,
  Crown,
  Ban,
  CheckCircle2,
  Sparkles,
  Plus,
  Minus,
  UserCog,
  Wallet as WalletIcon,
  Settings2,
  Lock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ValtisLogo } from "@/components/valtis/logo";
import { NotificationsBell } from "@/components/valtis/notifications-bell";
import { AdminRecipientBlocks } from "@/components/valtis/admin-recipient-blocks";
import { Button } from "@/components/ui/button";
import { unlockAdmin, isAdminUnlocked, lockAdmin } from "@/lib/admin-gate.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Administration · Valtis" }] }),
  component: AdminGateWrapper,
});

function AdminGateWrapper() {
  const checkUnlocked = useServerFn(isAdminUnlocked);
  const doUnlock = useServerFn(unlockAdmin);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const gate = useQuery({
    queryKey: ["admin-gate-unlocked"],
    queryFn: () => checkUnlocked({}),
    staleTime: 60_000,
  });

  if (gate.isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Vérification…</div>;
  }

  if (!gate.data?.unlocked) {
    async function submitGate(e: React.FormEvent) {
      e.preventDefault();
      setSubmitting(true);
      const res = await doUnlock({ data: { password } });
      setSubmitting(false);
      if (!res.ok) return toast.error("Mot de passe incorrect");
      toast.success("Accès administrateur déverrouillé");
      gate.refetch();
    }
    return (
      <div className="min-h-screen flex flex-col">
        <header className="border-b border-border/40">
          <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
            <ValtisLogo />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-6">
          <form onSubmit={submitGate} className="w-full max-w-sm space-y-5 border border-border rounded-2xl p-8 bg-surface/40">
            <div className="text-center space-y-2">
              <Lock className="w-8 h-8 mx-auto text-gold-gradient" />
              <h1 className="font-display text-2xl">Espace administrateur</h1>
              <p className="text-xs text-muted-foreground">Mot de passe requis pour accéder au centre de pilotage.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gate-pw">Mot de passe administrateur</Label>
              <Input id="gate-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
            </div>
            <Button type="submit" variant="gold" className="w-full" disabled={submitting}>
              {submitting ? "Vérification…" : "Déverrouiller"}
            </Button>
            <Link to="/dashboard" className="block text-center text-xs text-muted-foreground hover:text-foreground">← Retour</Link>
          </form>
        </main>
      </div>
    );
  }

  return <AdminPage onLock={async () => { await lockAdmin({}); gate.refetch(); }} />;
}

type Client = {
  user_id: string;
  email: string;
  full_name: string | null;
  kyc_status: string;
  total_cad: number;
  card_id: string | null;
  card_tier: "standard" | "gold_plus" | null;
  card_status: "active" | "blocked" | "expired" | null;
  card_last4: string | null;
  is_admin: boolean;
  is_compliance: boolean;
};

type AdminWallet = {
  id: string;
  currency: string;
  balance: number;
  label: string | null;
  is_primary: boolean;
};

function formatCad(n: number) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

function kycBadgeClass(status: string) {
  switch (status) {
    case "approved":
    case "verified":
      return "border-primary/40 text-primary";
    case "review":
      return "border-gold/40 text-gold-gradient";
    case "rejected":
      return "border-destructive/40 text-destructive";
    default:
      return "border-border text-muted-foreground";
  }
}

function AdminPage({ onLock }: { onLock: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [manageUser, setManageUser] = useState<Client | null>(null);
  const [adjustWallet, setAdjustWallet] = useState<AdminWallet | null>(null);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustDir, setAdjustDir] = useState<"credit" | "debit">("credit");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const { data: isAdmin, isLoading: roleLoading } = useQuery({
    queryKey: ["isAdmin", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!)
        .eq("role", "admin")
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });

  const { data: anyAdmin } = useQuery({
    queryKey: ["anyAdmin"],
    enabled: !!userId && isAdmin === false,
    queryFn: async () => {
      const { count } = await supabase
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin");
      return (count ?? 0) > 0;
    },
  });

  const { data: clients, refetch } = useQuery({
    queryKey: ["admin-clients"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_clients");
      if (error) throw error;
      return ((data ?? []) as unknown) as Client[];
    },
  });

  const { data: manageWallets, refetch: refetchWallets } = useQuery({
    queryKey: ["admin-user-wallets", manageUser?.user_id],
    enabled: !!manageUser,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_user_wallets", { _user_id: manageUser!.user_id });
      if (error) throw error;
      return ((data ?? []) as unknown) as AdminWallet[];
    },
  });

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function bootstrap() {
    const { error } = await supabase.rpc("claim_admin_if_none");
    if (error) return toast.error(error.message);
    toast.success("Vous êtes désormais administrateur.");
    qc.invalidateQueries({ queryKey: ["isAdmin"] });
  }

  async function setTier(cardId: string, tier: "standard" | "gold_plus") {
    setBusy(cardId + tier);
    const { error } = await supabase.rpc("admin_set_card_tier", { _card_id: cardId, _tier: tier });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(tier === "gold_plus" ? "Carte passée en Gold Plus." : "Carte rétrogradée en Standard.");
    refetch();
  }

  async function setStatus(cardId: string, status: "active" | "blocked") {
    setBusy(cardId + status);
    const { error } = await supabase.rpc("admin_set_card_status", { _card_id: cardId, _status: status });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(status === "active" ? "Carte réactivée." : "Carte bloquée.");
    refetch();
  }

  async function setKyc(uid: string, status: "approved" | "rejected" | "review" | "pending") {
    setBusy(uid + status);
    const { error } = await supabase.rpc("admin_set_kyc_status", { _user_id: uid, _status: status });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Statut KYC mis à jour");
    refetch();
  }

  async function toggleRole(uid: string, role: "admin" | "compliance_officer", grant: boolean) {
    setBusy(uid + role + grant);
    const { error } = await supabase.rpc("admin_set_role", { _user_id: uid, _role: role, _grant: grant });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(grant ? "Rôle attribué" : "Rôle retiré");
    refetch();
  }

  async function submitAdjust() {
    if (!adjustWallet) return;
    const n = parseFloat(adjustDelta);
    if (!n || n <= 0) return toast.error("Montant invalide");
    const signed = adjustDir === "credit" ? n : -n;
    const { error } = await supabase.rpc("admin_adjust_wallet", {
      _wallet_id: adjustWallet.id,
      _delta: signed,
      _reason: adjustReason || "Ajustement administrateur",
    });
    if (error) return toast.error(error.message);
    toast.success("Portefeuille ajusté");
    setAdjustWallet(null);
    setAdjustDelta("");
    setAdjustReason("");
    refetchWallets();
    refetch();
  }

  if (roleLoading || isAdmin === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Chargement…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="border-b border-border/40">
          <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
            <ValtisLogo />
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-md text-center space-y-5">
            <ShieldCheck className="w-10 h-10 mx-auto text-primary" />
            <h1 className="font-display text-2xl font-semibold">Accès administrateur</h1>
            {anyAdmin === false ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Aucun administrateur n'est encore configuré. Vous pouvez revendiquer ce rôle maintenant (première installation uniquement).
                </p>
                <Button variant="gold" onClick={bootstrap}>Devenir administrateur</Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Votre compte n'a pas les privilèges d'administration. Contactez un administrateur existant.
              </p>
            )}
            <Link to="/dashboard" className="text-xs text-muted-foreground hover:text-foreground inline-block">
              ← Retour au tableau de bord
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const list = clients ?? [];
  const pendingKyc = list.filter((c) => c.kyc_status === "review" || c.kyc_status === "pending").length;
  const totalAum = list.reduce((acc, c) => acc + Number(c.total_cad), 0);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/40 sticky top-0 z-40 backdrop-blur-sm bg-background/70">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <ValtisLogo />
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">Accueil</Link>
            <Link to="/wallets" className="text-muted-foreground hover:text-foreground">Portefeuilles</Link>
            <Link to="/cards" className="text-muted-foreground hover:text-foreground">Cartes</Link>
            <Link to="/admin" className="text-foreground">Admin</Link>
          </nav>
          <div className="flex items-center gap-2">
            <NotificationsBell userId={userId} />
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-12 space-y-8">
        <div className="flex items-center gap-3">
          <Crown className="w-6 h-6 text-gold-gradient" />
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Centre de pilotage</p>
            <h1 className="font-display text-3xl font-semibold">Administration Valtis</h1>
          </div>
        </div>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-surface/40 p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Clients</p>
            <p className="font-display text-2xl mt-1">{list.length}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface/40 p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">KYC à valider</p>
            <p className="font-display text-2xl mt-1 text-gold-gradient">{pendingKyc}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface/40 p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Cartes Gold Plus</p>
            <p className="font-display text-2xl mt-1">{list.filter((c) => c.card_tier === "gold_plus").length}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface/40 p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Patrimoine total</p>
            <p className="font-display text-2xl mt-1">{formatCad(totalAum)}</p>
          </div>
        </section>

        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Client</th>
                <th className="text-left px-4 py-3 font-medium">KYC</th>
                <th className="text-left px-4 py-3 font-medium">Rôles</th>
                <th className="text-right px-4 py-3 font-medium">Patrimoine</th>
                <th className="text-left px-4 py-3 font-medium">Carte</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {list.map((c) => {
                const eligible = Number(c.total_cad) >= 500000;
                const isGold = c.card_tier === "gold_plus";
                return (
                  <tr key={c.user_id} className="hover:bg-surface/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{c.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${kycBadgeClass(c.kyc_status)}`}>
                        {c.kyc_status}
                      </span>
                      {(c.kyc_status === "review" || c.kyc_status === "pending") && (
                        <div className="mt-1.5 flex gap-1">
                          <Button size="sm" variant="gold" className="h-6 px-2 text-[10px]" disabled={busy === c.user_id + "approved"} onClick={() => setKyc(c.user_id, "approved")}>
                            Approuver
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={busy === c.user_id + "rejected"} onClick={() => setKyc(c.user_id, "rejected")}>
                            Refuser
                          </Button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.is_admin && <span className="text-[9px] uppercase px-1.5 py-0.5 rounded border border-gold/40 text-gold-gradient">admin</span>}
                        {c.is_compliance && <span className="text-[9px] uppercase px-1.5 py-0.5 rounded border border-primary/40 text-primary">compliance</span>}
                        {!c.is_admin && !c.is_compliance && <span className="text-[10px] text-muted-foreground">client</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{formatCad(Number(c.total_cad))}</td>
                    <td className="px-4 py-3">
                      {c.card_id ? (
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${isGold ? "border-gold text-gold-gradient" : "border-border text-muted-foreground"}`}>
                            {isGold ? "Gold Plus" : "Standard"}
                          </span>
                          <span className="text-xs text-muted-foreground">•••• {c.card_last4}</span>
                          {c.card_status === "blocked" && <span className="text-[10px] text-red-400">bloquée</span>}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2 flex-wrap justify-end">
                        {c.card_id && !isGold && (
                          <Button
                            size="sm"
                            variant="gold"
                            disabled={!eligible || busy === c.card_id + "gold_plus"}
                            onClick={() => setTier(c.card_id!, "gold_plus")}
                            title={eligible ? "Activer Gold Plus" : "Solde insuffisant (≥ 500 000 CAD)"}
                          >
                            <Sparkles className="w-3 h-3" /> Gold+
                          </Button>
                        )}
                        {c.card_id && isGold && (
                          <Button size="sm" variant="outline" onClick={() => setTier(c.card_id!, "standard")} disabled={busy === c.card_id + "standard"}>
                            Rétrograder
                          </Button>
                        )}
                        {c.card_id && c.card_status !== "blocked" && (
                          <Button size="sm" variant="ghost" onClick={() => setStatus(c.card_id!, "blocked")} disabled={busy === c.card_id + "blocked"} title="Bloquer la carte">
                            <Ban className="w-3 h-3" />
                          </Button>
                        )}
                        {c.card_id && c.card_status === "blocked" && (
                          <Button size="sm" variant="ghost" onClick={() => setStatus(c.card_id!, "active")} disabled={busy === c.card_id + "active"} title="Activer la carte">
                            <CheckCircle2 className="w-3 h-3" />
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => setManageUser(c)} title="Gérer cet utilisateur">
                          <Settings2 className="w-3 h-3" /> Gérer
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Aucun client à afficher.</div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Le passage en Gold Plus nécessite un patrimoine global ≥ 500 000 CAD. Toutes les actions sont tracées dans le journal d'audit.
        </p>

        <AdminRecipientBlocks />
      </main>

      {/* Manage user dialog */}
      <Dialog open={!!manageUser} onOpenChange={(o) => !o && setManageUser(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <UserCog className="w-5 h-5 text-primary" /> Gérer {manageUser?.full_name || manageUser?.email}
            </DialogTitle>
            <DialogDescription>
              Pilotez les privilèges et ajustez les fonds depuis cette console.
            </DialogDescription>
          </DialogHeader>

          {manageUser && (
            <div className="space-y-6">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Rôles</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={manageUser.is_admin ? "gold" : "outline"}
                    onClick={() => toggleRole(manageUser.user_id, "admin", !manageUser.is_admin)}
                  >
                    <Crown className="w-3 h-3" /> {manageUser.is_admin ? "Retirer admin" : "Promouvoir admin"}
                  </Button>
                  <Button
                    size="sm"
                    variant={manageUser.is_compliance ? "default" : "outline"}
                    onClick={() => toggleRole(manageUser.user_id, "compliance_officer", !manageUser.is_compliance)}
                  >
                    <ShieldCheck className="w-3 h-3" /> {manageUser.is_compliance ? "Retirer compliance" : "Nommer compliance"}
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">KYC</p>
                <div className="flex flex-wrap gap-2">
                  {(["approved", "review", "pending", "rejected"] as const).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={manageUser.kyc_status === s ? "gold" : "outline"}
                      onClick={() => setKyc(manageUser.user_id, s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                  <WalletIcon className="w-3.5 h-3.5" /> Portefeuilles
                </p>
                <div className="space-y-2">
                  {(manageWallets ?? []).map((w) => (
                    <div key={w.id} className="flex items-center justify-between rounded-lg border border-border bg-surface/40 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{w.label} <span className="text-xs text-muted-foreground">· {w.currency}</span></p>
                        <p className="text-xs font-mono">{Number(w.balance).toLocaleString("fr-CA")}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => { setAdjustWallet(w); setAdjustDir("credit"); }}>
                          <Plus className="w-3 h-3" /> Créditer
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setAdjustWallet(w); setAdjustDir("debit"); }}>
                          <Minus className="w-3 h-3" /> Débiter
                        </Button>
                      </div>
                    </div>
                  ))}
                  {(manageWallets ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">Aucun portefeuille.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Adjust wallet dialog */}
      <Dialog open={!!adjustWallet} onOpenChange={(o) => !o && setAdjustWallet(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">
              {adjustDir === "credit" ? "Créditer" : "Débiter"} le portefeuille
            </DialogTitle>
            <DialogDescription>
              {adjustWallet?.label} · {adjustWallet?.currency} · solde {Number(adjustWallet?.balance ?? 0).toLocaleString("fr-CA")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Sens</Label>
              <Select value={adjustDir} onValueChange={(v) => setAdjustDir(v as "credit" | "debit")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Crédit (+)</SelectItem>
                  <SelectItem value="debit">Débit (-)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adj-amount">Montant</Label>
              <Input id="adj-amount" type="number" min="0" step="0.01" value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adj-reason">Motif</Label>
              <Input id="adj-reason" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="ex. correction conformité" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjustWallet(null)}>Annuler</Button>
            <Button variant="gold" onClick={submitAdjust}>Confirmer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}