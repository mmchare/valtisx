import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CreditCard, Landmark, Plus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ValtisLogo } from "@/components/valtis/logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Moyens de paiement · Valtis" }] }),
  component: Settings,
});

type PaymentMethod = {
  id: string;
  type: "iban" | "card";
  label: string;
  iban: string | null;
  bic: string | null;
  bank_name: string | null;
  card_brand: string | null;
  card_last4: string | null;
  card_exp_month: number | null;
  card_exp_year: number | null;
  card_holder: string | null;
  created_at: string;
};

const CONSENT_TEXT =
  "J'autorise l'enregistrement de mes informations bancaires pour faciliter mes futures transactions sécurisées.";

function maskIban(iban: string) {
  const clean = iban.replace(/\s/g, "");
  return clean.slice(0, 4) + " •••• •••• " + clean.slice(-4);
}

// Détection basique de la marque à partir des premiers chiffres — purement indicative,
// aucune donnée de carte n'est envoyée au serveur au-delà de la marque/4-derniers-chiffres/expiration.
function detectBrand(num: string): string {
  if (/^4/.test(num)) return "Visa";
  if (/^5[1-5]/.test(num)) return "Mastercard";
  if (/^3[47]/.test(num)) return "American Express";
  return "Carte";
}

function Settings() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"iban" | "card">("iban");
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<PaymentMethod | null>(null);

  // Formulaire IBAN
  const [ibanLabel, setIbanLabel] = useState("");
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [bankName, setBankName] = useState("");

  // Formulaire carte — le numéro complet et le CVV restent UNIQUEMENT dans cet état local,
  // ne servent qu'à calculer marque/4-derniers-chiffres, et ne sont jamais envoyés au serveur.
  const [cardLabel, setCardLabel] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpMonth, setCardExpMonth] = useState("");
  const [cardExpYear, setCardExpYear] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  const [consent, setConsent] = useState(false);

  const { data: methods, isLoading } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_methods" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown) as PaymentMethod[];
    },
  });

  function resetForm() {
    setIbanLabel(""); setIban(""); setBic(""); setBankName("");
    setCardLabel(""); setCardHolder(""); setCardNumber("");
    setCardExpMonth(""); setCardExpYear(""); setCardCvv("");
    setConsent(false);
  }

  function openAdd() {
    resetForm();
    setTab("iban");
    setOpen(true);
  }

  async function submitIban(e: React.FormEvent) {
    e.preventDefault();
    if (!ibanLabel.trim()) return toast.error("Donnez un nom à ce compte (ex: Compte perso Boursorama)");
    if (!iban.trim() || !bic.trim()) return toast.error("IBAN et BIC/SWIFT requis");
    if (!consent) return toast.error("Le consentement est obligatoire pour enregistrer ce moyen de paiement");
    setSaving(true);
    const { error } = await supabase.rpc("add_payment_method_iban" as never, {
      _label: ibanLabel.trim(),
      _iban: iban.trim(),
      _bic: bic.trim(),
      _bank_name: bankName.trim() || null,
      _consent: true,
    } as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Compte bancaire enregistré");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["payment-methods"] });
  }

  async function submitCard(e: React.FormEvent) {
    e.preventDefault();
    const digits = cardNumber.replace(/\s/g, "");
    if (!cardLabel.trim()) return toast.error("Donnez un nom à cette carte (ex: Visa perso)");
    if (digits.length < 12) return toast.error("Numéro de carte invalide");
    const month = parseInt(cardExpMonth, 10);
    const year = parseInt(cardExpYear, 10);
    if (!month || month < 1 || month > 12) return toast.error("Mois d'expiration invalide");
    if (!year || year < new Date().getFullYear()) return toast.error("Année d'expiration invalide");
    if (!cardCvv.trim()) return toast.error("CVV requis pour vérifier la carte");
    if (!consent) return toast.error("Le consentement est obligatoire pour enregistrer ce moyen de paiement");

    setSaving(true);
    const brand = detectBrand(digits);
    // Numéro complet transmis et stocké tel quel (jeu de données fictif, hors production) — le CVV, lui,
    // n'est jamais envoyé : il ne sert qu'à vérifier localement la saisie, aucune utilité côté serveur.
    const { error } = await supabase.rpc("add_payment_method_card" as never, {
      _label: cardLabel.trim(),
      _card_number: digits,
      _card_brand: brand,
      _exp_month: month,
      _exp_year: year,
      _card_holder: cardHolder.trim() || null,
      _consent: true,
    } as never);
    // Le CVV ne sert qu'à cette vérification locale et n'est jamais transmis ; on l'efface tout de suite.
    setCardCvv("");
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Carte enregistrée");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["payment-methods"] });
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const { error } = await supabase.rpc("delete_payment_method" as never, { _id: toDelete.id } as never);
    if (error) toast.error(error.message);
    else {
      toast.success("Moyen de paiement supprimé");
      qc.invalidateQueries({ queryKey: ["payment-methods"] });
    }
    setToDelete(null);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-3">
          <Link to="/dashboard" className="p-2 -ml-2 rounded-lg hover:bg-secondary transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <ValtisLogo className="h-6" />
          <span className="text-sm text-muted-foreground">Moyens de paiement</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-semibold">Moyens de paiement enregistrés</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Comptes bancaires et cartes utilisables pour vos virements P2P et externes.
            </p>
          </div>
          <Button variant="gold" onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1.5" /> Ajouter
          </Button>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}

        {!isLoading && (methods ?? []).length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Aucun moyen de paiement enregistré pour l'instant.
          </div>
        )}

        <div className="space-y-3">
          {(methods ?? []).map((m) => (
            <div key={m.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                  {m.type === "iban" ? <Landmark className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
                </div>
                <div>
                  <p className="font-medium text-sm">{m.label}</p>
                  {m.type === "iban" ? (
                    <p className="text-xs text-muted-foreground">{maskIban(m.iban!)} · {m.bic}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {m.card_brand} •••• {m.card_last4} · exp. {String(m.card_exp_month).padStart(2, "0")}/{m.card_exp_year}
                    </p>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setToDelete(m)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </main>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Ajouter un moyen de paiement</DialogTitle>
            <DialogDescription>Utilisable ensuite pour vos virements P2P et externes.</DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "iban" | "card")}>
            <TabsList className="grid grid-cols-2 mb-4">
              <TabsTrigger value="iban">Compte bancaire</TabsTrigger>
              <TabsTrigger value="card">Carte</TabsTrigger>
            </TabsList>

            <TabsContent value="iban">
              <form onSubmit={submitIban} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="iban-label">Nom du compte</Label>
                  <Input id="iban-label" placeholder="Ex: Compte perso Boursorama" value={ibanLabel} onChange={(e) => setIbanLabel(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="iban">IBAN</Label>
                  <Input id="iban" placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX" value={iban} onChange={(e) => setIban(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bic">BIC / SWIFT</Label>
                  <Input id="bic" placeholder="BNPAFRPPXXX" value={bic} onChange={(e) => setBic(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bank">Établissement (optionnel)</Label>
                  <Input id="bank" placeholder="BNP Paribas" value={bankName} onChange={(e) => setBankName(e.target.value)} />
                </div>
                <ConsentBox checked={consent} onChange={setConsent} />
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
                  <Button type="submit" variant="gold" disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enregistrer"}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>

            <TabsContent value="card">
              <form onSubmit={submitCard} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="card-label">Nom de la carte</Label>
                  <Input id="card-label" placeholder="Ex: Visa perso" value={cardLabel} onChange={(e) => setCardLabel(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="card-holder">Titulaire</Label>
                  <Input id="card-holder" placeholder="NOM Prénom" value={cardHolder} onChange={(e) => setCardHolder(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="card-number">Numéro de carte</Label>
                  <Input id="card-number" inputMode="numeric" placeholder="•••• •••• •••• ••••" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">
                    Jeu de données fictif — le numéro complet est stocké tel quel pour vérification interne.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="exp-m">Mois</Label>
                    <Input id="exp-m" inputMode="numeric" placeholder="MM" value={cardExpMonth} onChange={(e) => setCardExpMonth(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="exp-y">Année</Label>
                    <Input id="exp-y" inputMode="numeric" placeholder="AAAA" value={cardExpYear} onChange={(e) => setCardExpYear(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cvv">CVV</Label>
                    <Input id="cvv" inputMode="numeric" placeholder="•••" value={cardCvv} onChange={(e) => setCardCvv(e.target.value)} />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Le CVV sert uniquement à vérifier la carte au moment de l'ajout — il n'est jamais enregistré, ni transmis au-delà de ce formulaire.
                </p>
                <ConsentBox checked={consent} onChange={setConsent} />
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
                  <Button type="submit" variant="gold" disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enregistrer"}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce moyen de paiement ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {toDelete?.label} » sera définitivement supprimé de votre compte Valtis.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ConsentBox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 rounded-lg border border-border p-3 cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <span className="text-xs text-muted-foreground leading-relaxed">{CONSENT_TEXT}</span>
    </label>
  );
}
