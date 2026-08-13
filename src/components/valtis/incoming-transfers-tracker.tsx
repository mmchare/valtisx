import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertTriangle, ShieldAlert, Info, FileCheck2, Loader2, Clock } from "lucide-react";
import { SwiftMessage } from "@/components/valtis/swift-message";

type IncomingTransfer = {
  id: string;
  amount: number;
  currency: string;
  created_at: string;
  reference: string | null;
  recipient_identifier: string;
  sender_id: string;
  // Statut du destinataire -- seul blocage qui empeche reellement le credit des fonds.
  recipient_status: string;
  recipient_block_reason: string | null;
  required_documents: { code: string; label: string }[] | null;
  submitted_documents: { code: string; label?: string; reference: string }[] | null;
  // Statut cote emetteur -- purement informatif pour le destinataire (aucune action de sa part).
  status: string;
  progress: number;
  current_step: string | null;
  block_reason: string | null;
};

const STEP_LABELS: Record<string, string> = {
  auth: "Authentification renforcée du donneur d'ordre",
  wallet: "Vérification du portefeuille source",
  aml: "Contrôle anti-blanchiment (AML / CFT)",
  benef: "Validation du bénéficiaire & sanctions",
  edd: "Conformité approfondie (EDD)",
  reserve: "Réservation des fonds",
  purpose_docs: "Vérification documentaire du motif de virement",
  route: "Routage SWIFT / SEPA",
  confirm: "Confirmation finale",
};

// Simplification : seul le KYC du destinataire peut reellement bloquer la reception des fonds.
// Le detail des etapes/blocages cote emetteur reste affiche a titre informatif, pour la clarte,
// mais ne necessite jamais d'action du destinataire.
export function IncomingTransfersTracker({ userId }: { userId: string | null }) {
  const qc = useQueryClient();
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function submitDocuments(t: IncomingTransfer) {
    const required = t.required_documents ?? [];
    const missing = required.filter((d) => !files[`${t.id}:${d.code}`]);
    if (missing.length > 0) {
      return toast.error(`Documents manquants : ${missing.map((d) => d.label).join(", ")}`);
    }
    setBusy(t.id);
    const documents: { code: string; label: string; reference: string }[] = [];
    for (const doc of required) {
      const file = files[`${t.id}:${doc.code}`]!;
      if (file.type !== "application/pdf") {
        setBusy(null);
        return toast.error(`${doc.label} : le format PDF est obligatoire`);
      }
      if (file.size > 8 * 1024 * 1024) {
        setBusy(null);
        return toast.error(`${doc.label} : fichier trop lourd (max 8 Mo)`);
      }
      const path = `${userId}/recipient-${t.id}-${doc.code}-${Date.now()}.pdf`;
      const up = await supabase.storage
        .from("kyc-documents")
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (up.error) {
        setBusy(null);
        return toast.error(`${doc.label} : ${up.error.message}`);
      }
      documents.push({ code: doc.code, label: doc.label, reference: path });
    }
    const { error } = await supabase.rpc("recipient_submit_documents" as never, {
      _transfer_id: t.id,
      _documents: documents,
    } as never);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Dossier transmis", { description: "La conformité Valtis examine vos justificatifs." });
    qc.invalidateQueries({ queryKey: ["incoming-transfers", userId] });
  }

  const { data: incoming } = useQuery({
    queryKey: ["incoming-transfers", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfers")
        .select("id, amount, currency, created_at, reference, recipient_identifier, sender_id, recipient_status, recipient_block_reason, required_documents, submitted_documents, status, progress, current_step, block_reason")
        .eq("recipient_user_id", userId!)
        .in("status", ["verifying", "blocked"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as IncomingTransfer[];
    },
  });

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("transfers-incoming-" + userId)
      .on("postgres_changes", { event: "*", schema: "public", table: "transfers", filter: `recipient_user_id=eq.${userId}` }, () => {
        qc.invalidateQueries({ queryKey: ["incoming-transfers", userId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);

  if (!incoming || incoming.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-5 h-5 text-amber-500" />
        <h2 className="font-display text-xl">Transferts entrants en cours</h2>
      </div>
      <div className="grid gap-4">
        {incoming.map((t) => {
          const kycBlocked = t.recipient_status === "blocked";
          const required = t.required_documents ?? [];
          const docsRequired = t.recipient_status === "documents_required" && required.length > 0;
          const docsReview = t.recipient_status === "documents_review";
          return (
            <div key={t.id} className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Transfert entrant</p>
                  <p className="font-display text-2xl">
                    {Number(t.amount).toLocaleString("fr-CA")} {t.currency}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Reçu le {new Date(t.created_at).toLocaleString("fr-CA")}
                  </p>
                </div>
                <span className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-full border ${
                  kycBlocked || docsRequired || docsReview ? "border-amber-500/40 text-amber-600" : "border-primary/30 text-primary"
                }`}>
                  {kycBlocked
                    ? "Votre KYC requis"
                    : docsRequired
                      ? "Documents requis — 63%"
                      : docsReview
                        ? "En revue conformité — 63%"
                        : t.status === "blocked"
                          ? `Émetteur bloqué à ${t.progress}%`
                          : `En cours — ${t.progress}%`}
                </span>
              </div>

              {(docsRequired || docsReview) && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3.5 space-y-3">
                  <p className="text-xs text-amber-700 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    {t.recipient_block_reason ||
                      "Des justificatifs de conformité sont requis avant le crédit des fonds."}
                  </p>
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                      <span>Votre parcours conformité</span>
                      <span>63%</span>
                    </div>
                    <Progress value={63} className="h-1.5 [&>div]:bg-amber-500" />
                  </div>

                  {docsReview ? (
                    <p className="text-xs text-muted-foreground flex items-start gap-2">
                      <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      Dossier complet reçu. Un analyste conformité Valtis examine vos documents depuis le back-office —
                      les fonds seront crédités dès validation.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {required.map((d) => {
                        const key = `${t.id}:${d.code}`;
                        return (
                          <div key={d.code} className="space-y-1.5">
                            <Label htmlFor={key} className="text-xs flex items-center gap-1.5">
                              <FileCheck2 className={`w-3.5 h-3.5 ${files[key] ? "text-emerald-500" : "text-muted-foreground"}`} />
                              {d.label} <span className="text-muted-foreground">(PDF)</span>
                            </Label>
                            <input
                              id={key}
                              type="file"
                              accept="application/pdf"
                              onChange={(e) =>
                                setFiles((prev) => ({ ...prev, [key]: e.target.files?.[0] ?? null }))
                              }
                              className="block w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:bg-secondary file:text-xs file:text-foreground"
                            />
                          </div>
                        );
                      })}
                      <div className="flex justify-end">
                        <Button size="sm" variant="gold" onClick={() => submitDocuments(t)} disabled={busy === t.id}>
                          {busy === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileCheck2 className="w-3.5 h-3.5" />}
                          Transmettre mes justificatifs
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Bloc informatif : progression cote emetteur, aucune action requise du destinataire */}
              <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                  <span className="flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> Étape côté donneur d'ordre</span>
                  <span>{t.progress}%</span>
                </div>
                <Progress value={t.progress} className={t.status === "blocked" ? "h-1.5 [&>div]:bg-amber-500" : "h-1.5"} />
                <p className="text-xs text-muted-foreground mt-2">
                  {t.current_step ? STEP_LABELS[t.current_step] ?? t.current_step : "Vérification en cours."}
                  {t.status === "blocked" && t.block_reason && (
                    <span className="block mt-1 text-amber-600">{t.block_reason}</span>
                  )}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Information uniquement — cette étape est gérée par le donneur d'ordre, aucune action requise de votre part.
                </p>
              </div>

              {/* Seul blocage reel cote destinataire : son propre KYC */}
              {kycBlocked && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3.5">
                  <p className="text-xs text-amber-700 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    {t.recipient_block_reason || "Votre identité doit être vérifiée avant que ce transfert ne soit crédité."}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1 pl-5">
                    Complétez votre vérification KYC depuis votre tableau de bord — les fonds seront crédités automatiquement dès approbation.
                  </p>
                </div>
              )}

              <SwiftMessage
                input={{
                  transferId: t.id,
                  amount: Number(t.amount),
                  currency: t.currency,
                  createdAt: t.created_at,
                  senderId: t.sender_id,
                  recipientIdentifier: t.recipient_identifier,
                  reference: t.reference,
                }}
                className="mt-1"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
