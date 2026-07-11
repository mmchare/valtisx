import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { SwiftMessage } from "@/components/valtis/swift-message";

type IncomingTransfer = {
  id: string;
  amount: number;
  currency: string;
  recipient_progress: number;
  recipient_status: string;
  recipient_block_reason: string | null;
  sender_id: string;
  created_at: string;
  reference: string | null;
  recipient_identifier: string;
};

// Simplification : le seul blocage cote destinataire est desormais son propre KYC.
// Des lors qu'il est approuve, tout virement en attente pour cette raison est
// automatiquement libere cote serveur (voir admin_set_kyc_status).
export function IncomingTransfersTracker({ userId }: { userId: string | null }) {
  const qc = useQueryClient();

  const { data: incoming } = useQuery({
    queryKey: ["incoming-transfers", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfers")
        .select("id, amount, currency, recipient_progress, recipient_status, recipient_block_reason, sender_id, created_at, reference, recipient_identifier")
        .eq("recipient_user_id", userId!)
        .eq("recipient_status", "blocked")
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
        <h2 className="font-display text-xl">Transferts entrants — vérification d'identité requise</h2>
      </div>
      <div className="grid gap-4">
        {incoming.map((t) => (
          <div key={t.id} className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-4">
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
                Bloqué à {t.recipient_progress}%
              </span>
            </div>

            <div>
              <Progress value={t.recipient_progress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-amber-500 shrink-0" />
                {t.recipient_block_reason || "Votre identité doit être vérifiée avant que ce transfert ne soit crédité."}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 pl-5">
                Complétez votre vérification KYC depuis votre tableau de bord — les fonds seront crédités automatiquement dès approbation, sans autre démarche de votre part.
              </p>
            </div>

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
        ))}
      </div>
    </section>
  );
}
