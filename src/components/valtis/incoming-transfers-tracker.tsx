import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle2, FileCheck2, ShieldAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SwiftMessage } from "@/components/valtis/swift-message";

type RequiredDoc = { code: string; label: string };
type IncomingTransfer = {
  id: string;
  amount: number;
  currency: string;
  recipient_progress: number;
  recipient_status: string;
  recipient_block_reason: string | null;
  required_documents: RequiredDoc[];
  submitted_documents: { code: string; reference: string }[];
  sender_id: string;
  created_at: string;
  reference: string | null;
  recipient_identifier: string;
};

export function IncomingTransfersTracker({ userId }: { userId: string | null }) {
  const qc = useQueryClient();

  const { data: incoming } = useQuery({
    queryKey: ["incoming-transfers", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfers")
        .select("id, amount, currency, recipient_progress, recipient_status, recipient_block_reason, required_documents, submitted_documents, sender_id, created_at, reference, recipient_identifier")
        .eq("recipient_user_id", userId!)
        .neq("recipient_status", "ok")
        .neq("status", "success")
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
        <h2 className="font-display text-xl">Transferts entrants — conformité requise</h2>
      </div>
      <div className="grid gap-4">
        {incoming.map((t) => (
          <IncomingCard key={t.id} t={t} onChanged={() => qc.invalidateQueries({ queryKey: ["incoming-transfers", userId] })} />
        ))}
      </div>
    </section>
  );
}

function IncomingCard({ t, onChanged }: { t: IncomingTransfer; onChanged: () => void }) {
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const required = Array.isArray(t.required_documents) ? t.required_documents : [];
  const allFilled = required.every((d) => (refs[d.code] || "").trim().length > 2);

  async function submit() {
    setSubmitting(true);
    const payload = required.map((d) => ({ code: d.code, reference: refs[d.code]?.trim() ?? "" }));
    const { error } = await supabase.rpc("recipient_submit_documents" as never, { _transfer_id: t.id, _documents: payload as never } as never);
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Documents envoyés à la conformité");
    onChanged();
  }

  const inReview = t.recipient_status === "documents_review";
  const blocked = !inReview && t.recipient_progress <= 63;
  const submittedCodes = new Set((t.submitted_documents ?? []).map((s) => s.code));
  const missingCount = required.filter((d) => !submittedCodes.has(d.code)).length;

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-4">
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
        <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full border border-amber-500/40 text-amber-600">
          {inReview ? "En revue conformité — 63%" : `Bloqué à ${t.recipient_progress}%`}
        </span>
      </div>

      <div>
        <Progress value={t.recipient_progress} className="h-2" />
        <p className="text-xs text-muted-foreground mt-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-amber-500 shrink-0" />
          {t.recipient_block_reason || "Vérification en cours."}
        </p>
        {required.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-1 pl-5">
            {inReview
              ? `Dossier complet (${required.length} document${required.length>1?"s":""}) — validation manuelle requise pour passer 63%.`
              : `${required.length - missingCount}/${required.length} document(s) soumis · ${missingCount} manquant(s).`}
          </p>
        )}
      </div>

      {blocked && required.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-amber-500/20">
          <p className="text-sm font-medium flex items-center gap-2">
            <FileCheck2 className="w-4 h-4" /> Documents à fournir
          </p>
          {required.map((d) => (
            <div key={d.code} className="grid gap-1.5">
              <Label htmlFor={`${t.id}-${d.code}`} className="text-xs">{d.label}</Label>
              <Input
                id={`${t.id}-${d.code}`}
                placeholder="Référence du document (n°, lien sécurisé, hash)"
                value={refs[d.code] ?? ""}
                onChange={(e) => setRefs((r) => ({ ...r, [d.code]: e.target.value }))}
              />
            </div>
          ))}
          <Button variant="gold" disabled={!allFilled || submitting} onClick={submit}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
            Soumettre à la conformité
          </Button>
        </div>
      )}

      {t.recipient_status === "tier_upgrade_required" && (
        <p className="text-xs text-muted-foreground border-t border-amber-500/20 pt-3">
          Votre carte doit être surclassée par un administrateur avant que les fonds puissent être crédités.
        </p>
      )}

      {inReview && (
        <p className="text-xs text-muted-foreground border-t border-amber-500/20 pt-3 flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
          Dossier en cours d'examen par la cellule conformité Valtis. La jauge reste bloquée à 63% jusqu'à validation manuelle.
        </p>
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
}