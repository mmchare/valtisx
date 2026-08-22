import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertTriangle, ShieldAlert, Info, FileCheck2, Loader2, Clock } from "lucide-react";
import { SwiftMessage } from "@/components/valtis/swift-message";
import { useTranslation } from "react-i18next";

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
  recipient_progress: number;
  current_step: string | null;
  block_reason: string | null;
};

type SenderProfile = { id: string; full_name: string | null; email: string };

// Simplification : seul le KYC du destinataire peut reellement bloquer la reception des fonds.
// Le detail des etapes/blocages cote emetteur reste affiche a titre informatif, pour la clarte,
// mais ne necessite jamais d'action du destinataire.
export function IncomingTransfersTracker({ userId }: { userId: string | null }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function submitDocuments(transfer: IncomingTransfer) {
    const required = transfer.required_documents ?? [];
    const missing = required.filter((d) => !files[`${transfer.id}:${d.code}`]);
    if (missing.length > 0) {
      return toast.error(t("documents_manquants", { documents: missing.map((d) => d.label).join(", ") }));
    }
    setBusy(transfer.id);
    const documents: { code: string; label: string; reference: string }[] = [];
    for (const doc of required) {
      const file = files[`${transfer.id}:${doc.code}`]!;
      if (file.type !== "application/pdf") {
        setBusy(null);
        return toast.error(t("format_pdf_obligatoire", { document: doc.label }));
      }
      if (file.size > 8 * 1024 * 1024) {
        setBusy(null);
        return toast.error(t("fichier_trop_lourd_document", { document: doc.label }));
      }
      const path = `${userId}/recipient-${transfer.id}-${doc.code}-${Date.now()}.pdf`;
      const up = await supabase.storage
        .from("kyc-documents")
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (up.error) {
        setBusy(null);
        return toast.error(`${doc.label}: ${up.error.message}`);
      }
      documents.push({ code: doc.code, label: doc.label, reference: path });
    }
    const { error } = await supabase.rpc("recipient_submit_documents" as never, {
      _transfer_id: transfer.id,
      _documents: documents,
    } as never);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(t("dossier_transmis"), { description: t("conformite_examine_justificatifs") });
    qc.invalidateQueries({ queryKey: ["incoming-transfers", userId] });
  }

  const { data: incoming } = useQuery({
    queryKey: ["incoming-transfers", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfers")
        .select("id, amount, currency, created_at, reference, recipient_identifier, sender_id, recipient_status, recipient_block_reason, required_documents, submitted_documents, status, progress, recipient_progress, current_step, block_reason")
        .eq("recipient_user_id", userId!)
        .in("status", ["verifying", "blocked"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as IncomingTransfer[];
    },
  });

  const senderIds = [...new Set((incoming ?? []).map((transfer) => transfer.sender_id))];
  const { data: senders } = useQuery({
    queryKey: ["incoming-transfer-senders", senderIds],
    enabled: senderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", senderIds);
      if (error) throw error;
      return (data ?? []) as SenderProfile[];
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
        <h2 className="font-display text-xl">{t("transferts_entrants_en_cours")}</h2>
      </div>
      <div className="grid gap-4">
        {incoming.map((transfer) => {
          const kycBlocked = transfer.recipient_status === "blocked";
          const required = transfer.required_documents ?? [];
          const docsRequired = transfer.recipient_status === "documents_required" && required.length > 0;
          const docsReview = transfer.recipient_status === "documents_review";
          const isSpecialArtwork = required.some((document) => document.code === "icom_unesco_registration");
          const sender = senders?.find((profile) => profile.id === transfer.sender_id);
          const senderName = sender?.full_name || sender?.email || t("un_emetteur");
          return (
            <div key={transfer.id} className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("transfert_entrant")}</p>
                  <p className="font-display text-2xl">
                    {Number(transfer.amount).toLocaleString(i18n.resolvedLanguage === "en" ? "en-CA" : "fr-CA")} {transfer.currency}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("recu_le")} {new Date(transfer.created_at).toLocaleString(i18n.resolvedLanguage === "en" ? "en-CA" : "fr-CA")}
                  </p>
                </div>
                <span className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-full border ${
                  kycBlocked || docsRequired || docsReview ? "border-amber-500/40 text-amber-600" : "border-primary/30 text-primary"
                }`}>
                  {kycBlocked
                    ? t("votre_kyc_requis")
                    : docsRequired
                      ? t("documents_requis_pourcentage", { percentage: transfer.recipient_progress })
                      : docsReview
                        ? t("en_revue_conformite_pourcentage", { percentage: transfer.recipient_progress })
                        : transfer.status === "blocked"
                          ? t("emetteur_bloque_pourcentage", { percentage: transfer.progress })
                          : t("en_cours_pourcentage", { percentage: transfer.progress })}
                </span>
              </div>

              {(docsRequired || docsReview) && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3.5 space-y-3">
                  <p className="text-xs text-amber-700 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    {isSpecialArtwork
                      ? t("art_speciaux_destinataire", { sender: senderName })
                      : transfer.recipient_block_reason || t("justificatifs_requis_avant_credit")}
                  </p>
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                      <span>{t("votre_parcours_conformite")}</span>
                      <span>{transfer.recipient_progress}%</span>
                    </div>
                    <Progress value={transfer.recipient_progress} className="h-1.5 [&>div]:bg-amber-500" />
                  </div>

                  {docsReview ? (
                    <p className="text-xs text-muted-foreground flex items-start gap-2">
                      <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      {t("dossier_complet_recu_un_analyste")}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {required.map((d) => {
                        const key = `${transfer.id}:${d.code}`;
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
                        <Button size="sm" variant="gold" onClick={() => submitDocuments(transfer)} disabled={busy === transfer.id}>
                          {busy === transfer.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileCheck2 className="w-3.5 h-3.5" />}
                          {t("transmettre_mes_justificatifs")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Bloc informatif : progression cote emetteur, aucune action requise du destinataire */}
              <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                  <span className="flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> {t("etape_cote_donneur_dordre")}</span>
                  <span>{transfer.progress}%</span>
                </div>
                <Progress value={transfer.progress} className={transfer.status === "blocked" ? "h-1.5 [&>div]:bg-amber-500" : "h-1.5"} />
                <p className="text-xs text-muted-foreground mt-2">
                  {transfer.current_step ? t(`step_${transfer.current_step}`) : t("verification_en_cours")}
                  {transfer.status === "blocked" && transfer.block_reason && (
                    <span className="block mt-1 text-amber-600">{transfer.block_reason}</span>
                  )}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {t("information_uniquement_cette_etape_est")}
                </p>
              </div>

              {/* Seul blocage reel cote destinataire : son propre KYC */}
              {kycBlocked && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3.5">
                  <p className="text-xs text-amber-700 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    {isSpecialArtwork
                      ? t("art_speciaux_destinataire", { sender: senderName })
                      : transfer.recipient_block_reason || t("identite_a_verifier_credit")}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1 pl-5">
                    {t("completez_votre_verification_kyc_depuis")}
                  </p>
                </div>
              )}

              <SwiftMessage
                input={{
                  transferId: transfer.id,
                  amount: Number(transfer.amount),
                  currency: transfer.currency,
                  createdAt: transfer.created_at,
                  senderId: transfer.sender_id,
                  recipientIdentifier: transfer.recipient_identifier,
                  reference: transfer.reference,
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
