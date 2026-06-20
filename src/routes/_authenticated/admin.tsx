import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogOut, ShieldCheck, Crown, Ban, CheckCircle2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ValtisLogo } from "@/components/valtis/logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Administration · Valtis" }] }),
  component: AdminPage,
});

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
};

function formatCad(n: number) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

function AdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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

  if (roleLoading || isAdmin === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Chargement…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="border-b border-border/40">
          <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
            <ValtisLogo />
            <Button variant="ghost" size="sm" onClick={handleSignOut}><LogOut className="w-4 h-4" /></Button>
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
            <Link to="/dashboard" className="text-xs text-muted-foreground hover:text-foreground inline-block">← Retour au tableau de bord</Link>
          </div>
        </main>
      </div>
    );
  }

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
          <Button variant="ghost" size="sm" onClick={handleSignOut}><LogOut className="w-4 h-4" /></Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-12 space-y-8">
        <div className="flex items-center gap-3">
          <Crown className="w-6 h-6 text-gold-gradient" />
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Console</p>
            <h1 className="font-display text-3xl font-semibold">Administration Valtis</h1>
          </div>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Client</th>
                <th className="text-left px-4 py-3 font-medium">KYC</th>
                <th className="text-right px-4 py-3 font-medium">Patrimoine</th>
                <th className="text-left px-4 py-3 font-medium">Carte</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {(clients ?? []).map((c) => {
                const eligible = Number(c.total_cad) >= 500000;
                const isGold = c.card_tier === "gold_plus";
                return (
                  <tr key={c.user_id} className="hover:bg-surface/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{c.email}</div>
                    </td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{c.kyc_status}</td>
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
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        {c.card_id && !isGold && (
                          <Button
                            size="sm"
                            variant="gold"
                            disabled={!eligible || busy === c.card_id + "gold_plus"}
                            onClick={() => setTier(c.card_id!, "gold_plus")}
                            title={eligible ? "Activer Gold Plus" : "Solde insuffisant (≥ 500 000 CAD)"}
                          >
                            <Sparkles className="w-3 h-3" /> Gold Plus
                          </Button>
                        )}
                        {c.card_id && isGold && (
                          <Button size="sm" variant="outline" onClick={() => setTier(c.card_id!, "standard")} disabled={busy === c.card_id + "standard"}>
                            Rétrograder
                          </Button>
                        )}
                        {c.card_id && c.card_status !== "blocked" && (
                          <Button size="sm" variant="ghost" onClick={() => setStatus(c.card_id!, "blocked")} disabled={busy === c.card_id + "blocked"}>
                            <Ban className="w-3 h-3" />
                          </Button>
                        )}
                        {c.card_id && c.card_status === "blocked" && (
                          <Button size="sm" variant="ghost" onClick={() => setStatus(c.card_id!, "active")} disabled={busy === c.card_id + "active"}>
                            <CheckCircle2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(clients ?? []).length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Aucun client à afficher.</div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Le passage en Gold Plus nécessite un patrimoine global ≥ 500 000 CAD. Toutes les actions sont tracées dans le journal d'audit.
        </p>
      </main>
    </div>
  );
}