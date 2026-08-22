import { createFileRoute } from "@tanstack/react-router";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { analyzeTransferPurpose } from "@/lib/purpose-ai.functions";

const BASE_STEPS = [
  { key: "auth", label: "Authentification renforcée du donneur d'ordre", pct: 12 },
  { key: "wallet", label: "Vérification du portefeuille source", pct: 25 },
  { key: "aml", label: "Contrôle anti-blanchiment (AML / CFT)", pct: 38 },
  { key: "benef", label: "Validation du bénéficiaire & sanctions", pct: 50 },
  { key: "edd", label: "Conformité approfondie (EDD)", pct: 63 },
  { key: "reserve", label: "Réservation des fonds", pct: 75 },
  { key: "purpose_docs", label: "Vérification documentaire du motif de virement", pct: 82 },
  { key: "route", label: "Routage SWIFT / SEPA", pct: 88 },
  { key: "confirm", label: "Confirmation finale", pct: 100 },
];

const COMPLIANCE_CODE = "VALTIS-2026";
// Codes de déblocage EDD valides (utile en phase de test pour débloquer sans attendre un gestionnaire réel)
const COMPLIANCE_CODES = [COMPLIANCE_CODE, "ISMA-1441"];

type PurposeDoc = { code: string; label: string };

const PURPOSE_OPTIONS: { value: string; label: string }[] = [
  { value: "immobilier", label: "Achat de bien immobilier" },
  { value: "vehicule", label: "Achat de véhicule" },
  { value: "objets_art", label: "Achat d'objets d'art / antiquités" },
  { value: "art_speciaux", label: "Achat d'objets d'art spéciaux" },
  { value: "investissement", label: "Investissement / placement financier" },
  { value: "entreprise", label: "Investissement professionnel / entreprise" },
  { value: "don_familial", label: "Don familial" },
  { value: "frais_scolarite", label: "Frais de scolarité" },
  { value: "frais_medicaux", label: "Frais médicaux" },
  { value: "voyage", label: "Voyage / loisirs" },
  { value: "autre", label: "Autre motif" },
];

// Motifs nécessitant des justificatifs additionnels avant de finaliser le virement.
function purposeRequiredDocs(purpose: string): PurposeDoc[] {
  if (purpose === "objets_art") {
    return [
      { code: "art_certificate", label: "Certificat d'authenticité de l'œuvre / objet" },
      { code: "art_ownership", label: "Titre de propriété / preuve de possession" },
    ];
  }
  if (purpose === "art_speciaux") {
    return [
      { code: "art_special_certificate", label: "Certificat d'authenticité ou d'expertise pour l'objet spécial" },
      { code: "art_special_appraisal", label: "Évaluation / estimation professionnelle de l'objet" },
      { code: "art_special_provenance", label: "Document d'origine et de provenance de l'objet" },
    ];
  }
  if (purpose === "immobilier") {
    return [
      { code: "real_estate_deed", label: "Acte notarié / promesse de vente" },
      { code: "real_estate_id", label: "Pièce d'identité du notaire ou de l'étude" },
    ];
  }
  if (purpose === "vehicule") {
    return [
      { code: "vehicle_invoice", label: "Facture d'achat / bon de commande du véhicule" },
      { code: "vehicle_registration", label: "Certificat d'immatriculation ou titre de propriété du véhicule" },
    ];
  }
  return [];
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Tableau de bord · Valtis" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  // État simplifié pour les transferts
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferPurpose, setTransferPurpose] = useState("");
  const [transferPurposeDetail, setTransferPurposeDetail] = useState("");
  const [transferRef, setTransferRef] = useState("");
  const [phase, setPhase] = useState<"form" | "verifying" | "blocked" | "documents" | "success">("form");
  const [progress, setProgress] = useState(0);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [requiredPurposeDocs, setRequiredPurposeDocs] = useState<PurposeDoc[]>([]);
  const [transferId, setTransferId] = useState<string | null>(null);
  const [purposeDocsNeeded, setPurposeDocsNeeded] = useState<PurposeDoc[]>([]);
  const [submittingPurposeDocs, setSubmittingPurposeDocs] = useState(false);
  const [unlockCode, setUnlockCode] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  // Données mockées pour démonstration
  const wallets = [
    { id: "wallet_1", balance: "1000000", currency: "CAD" },
    { id: "wallet_2", balance: "500000", currency: "EUR" },
  ];

  const profile = { kyc_status: "approved" };

  function closeTransferDialog() {
    setTransferOpen(false);
    setPhase("form");
    setTransferFrom("");
    setTransferTo("");
    setTransferAmount("");
    setTransferPurpose("");
    setTransferPurposeDetail("");
    setTransferRef("");
    setProgress(0);
    setBlockReason(null);
    setRequiredPurposeDocs([]);
    setTransferId(null);
    setUnlockCode("");
    setAiNotice(null);
  }

  async function startTransfer(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(transferAmount);
    if (!transferFrom) return toast.error("Sélectionnez un portefeuille");
    if (!transferTo.trim()) return toast.error("Destinataire requis");
    if (!amount || amount <= 0) return toast.error("Montant invalide");
    if (!transferPurpose) return toast.error("Le motif du virement est obligatoire");
    if (transferPurpose === "autre" && transferPurposeDetail.trim().length < 5) {
      return toast.error("Décrivez précisément le motif du virement");
    }

    const w = wallets.find((x) => x.id === transferFrom);
    if (!w) return toast.error("Portefeuille introuvable");
    if (amount > Number(w.balance)) return toast.error("Solde insuffisant");

    const docsNeeded = purposeRequiredDocs(transferPurpose);
    setPurposeDocsNeeded(docsNeeded);
    setAiNotice(null);
    setPhase("verifying");

    const purposeLabel =
      transferPurpose === "autre"
        ? `Autre motif : ${transferPurposeDetail.trim()}`
        : PURPOSE_OPTIONS.find((p) => p.value === transferPurpose)?.label ?? transferPurpose;

    try {
      // Simulation création de transfert
      const tId = `transfer_${Date.now()}`;
      setTransferId(tId);

      // Pour les motifs libres, analyser avec IA
      if (transferPurpose === "autre") {
        try {
          const analysis = await analyzeTransferPurpose({
            data: { description: transferPurposeDetail.trim(), amount, currency: w.currency },
          });
          if (analysis.flagged) {
            toast.warning(`Analyse IA: ${analysis.reason}`);
            setPhase("blocked");
            setBlockReason(analysis.reason);
            setRequiredPurposeDocs(analysis.documents);
          } else {
            toast.success("Transfert lancé avec succès");
            setPhase("success");
          }
        } catch (err) {
          console.error("Erreur analyse IA:", err);
          setPhase("success");
        }
      } else if (docsNeeded.length > 0) {
        setPhase("documents");
        setRequiredPurposeDocs(docsNeeded);
      } else {
        toast.success("Transfert lancé avec succès");
        setPhase("success");
      }
    } catch (error) {
      toast.error("Erreur lors du transfert");
      setPhase("form");
    }
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Tableau de bord</h1>
          <p className="text-muted-foreground">Gestion de vos transferts et données</p>
        </div>

        <Button onClick={() => setTransferOpen(true)} variant="gold">
          Nouveau transfert
        </Button>

        {/* Dialog Transfert */}
        <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Effectuer un virement</DialogTitle>
              <DialogDescription>
                Remplissez les informations de votre virement
              </DialogDescription>
            </DialogHeader>

            {phase === "form" && (
              <form onSubmit={startTransfer} className="space-y-4">
                <div className="space-y-2">
                  <Label>Portefeuille source</Label>
                  <Select value={transferFrom} onValueChange={setTransferFrom}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un portefeuille" />
                    </SelectTrigger>
                    <SelectContent>
                      {wallets.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.currency} - {w.balance}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Destinataire</Label>
                  <Input
                    placeholder="@tag ou IBAN"
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Montant</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Motif du virement</Label>
                  <Select value={transferPurpose} onValueChange={setTransferPurpose}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un motif" />
                    </SelectTrigger>
                    <SelectContent>
                      {PURPOSE_OPTIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Certains motifs déclenchent une demande de justificatifs
                  </p>
                </div>

                {transferPurpose === "autre" && (
                  <div className="space-y-2">
                    <Label>Description du motif</Label>
                    <Textarea
                      rows={3}
                      placeholder="Décrivez le motif du virement"
                      value={transferPurposeDetail}
                      onChange={(e) => setTransferPurposeDetail(e.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Référence (optionnel)</Label>
                  <Input
                    placeholder="Précisions complémentaires"
                    value={transferRef}
                    onChange={(e) => setTransferRef(e.target.value)}
                  />
                </div>

                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={closeTransferDialog}>
                    Annuler
                  </Button>
                  <Button type="submit" variant="gold">
                    Lancer la vérification
                  </Button>
                </DialogFooter>
              </form>
            )}

            {phase === "verifying" && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Vérification en cours...</p>
                  <Progress value={progress} className="w-full" />
                </div>
                <p className="text-xs text-muted-foreground">{Math.round(progress)}%</p>
              </div>
            )}

            {phase === "blocked" && (
              <div className="space-y-4">
                <div className="bg-red-50 dark:bg-red-950 p-4 rounded border border-red-200 dark:border-red-800">
                  <p className="text-sm font-medium text-red-900 dark:text-red-200 mb-2">
                    Transfert bloqué - EDD
                  </p>
                  <p className="text-xs text-red-800 dark:text-red-300">{blockReason}</p>
                </div>
                <div className="space-y-2">
                  <Label>Code de déblocage conformité</Label>
                  <Input
                    placeholder="VALTIS-XXXX"
                    value={unlockCode}
                    onChange={(e) => setUnlockCode(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Obtenu auprès de votre gestionnaire dédié
                  </p>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPhase("form");
                      setUnlockCode("");
                      setBlockReason(null);
                    }}
                  >
                    Annuler
                  </Button>
                  <Button
                    variant="gold"
                    disabled={unlocking || !unlockCode}
                    onClick={() => {
                      setUnlocking(true);
                      setTimeout(() => {
                        if (unlockCode.toUpperCase() === COMPLIANCE_CODE || COMPLIANCE_CODES.includes(unlockCode)) {
                          toast.success("Code validé");
                          setPhase("success");
                        } else {
                          toast.error("Code invalide");
                        }
                        setUnlocking(false);
                      }, 1000);
                    }}
                  >
                    Valider
                  </Button>
                </DialogFooter>
              </div>
            )}

            {phase === "documents" && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-3">Documents à fournir</p>
                  <div className="space-y-2">
                    {requiredPurposeDocs.map((doc) => (
                      <div key={doc.code} className="flex items-center space-x-2">
                        <Checkbox id={doc.code} />
                        <Label htmlFor={doc.code} className="text-sm">
                          {doc.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={closeTransferDialog}>
                    Annuler
                  </Button>
                  <Button
                    variant="gold"
                    disabled={submittingPurposeDocs}
                    onClick={() => {
                      setSubmittingPurposeDocs(true);
                      setTimeout(() => {
                        toast.success("Documents transmis");
                        setPhase("success");
                        setSubmittingPurposeDocs(false);
                      }, 1000);
                    }}
                  >
                    Confirmer
                  </Button>
                </DialogFooter>
              </div>
            )}

            {phase === "success" && (
              <div className="space-y-4 text-center">
                <div className="text-4xl">✅</div>
                <p className="font-medium">Virement lancé avec succès</p>
                <p className="text-sm text-muted-foreground">
                  Vous recevrez une confirmation par e-mail dans quelques instants.
                </p>
                <Button onClick={closeTransferDialog} className="w-full">
                  Fermer
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
