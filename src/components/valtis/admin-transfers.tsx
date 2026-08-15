import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Ban, Loader2, ListOrdered } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type TransferRow = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  progress: number;
  recipient_status: string;
  recipient_identifier: string;
  purpose: string | null;
  created_at: string;
  required_documents: unknown[];
  submitted_documents: unknown[];
  purpose_required_documents: unknown[];
  purpose_submitted_documents: unknown[];
};

function isLocked(t: TransferRow) {
  const docsPending =
    ["blocked", "documents_required", "documents_review", "tier_upgrade_required", "sender_purpose_block"].includes(t.recipient_status) ||
    (t.required_documents?.length ?? 0) > (t.submitted_documents?.length ?? 0) ||
    (t.purpose_required_documents?.length ?? 0) > (t.purpose_submitted_documents?.length ?? 0);
  return t.status === "cancelled" || (t.status === "success" && !docsPending);
}

export function AdminTransfers() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<TransferRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: rows } = useQuery({
    queryKey: ["admin-all-transfers"],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfers")
        .select(
          "id, amount, currency, status, progress, recipient_status, recipient_identifier, purpose, created_at, required_documents, submitted_documents, purpose_required_documents, purpose_submitted_documents",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as TransferRow[];
    },
  });

  async function confirmCancel() {
    if (!target) return;
    if (reason.trim().length < 3) return toast.error("Indiquez la raison de l'annulation");
    setBusy(true);
    const { error } = await supabase.rpc("admin_cancel_transfer" as never, {
      _id: target.id,
      _reason: reason.trim(),
    } as never);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Virement annulé — parties notifiées par e-mail");
    setTarget(null);
    setReason("");
    qc.invalidateQueries({ queryKey: ["admin-all-transfers"] });
    qc.invalidateQueries({ queryKey: ["admin-recipient-blocks"] });
    qc.invalidateQueries({ queryKey: ["admin-clients"] });
  }

  return (
    <section className="space-y-3 pt-4 border-t border-border/40">
      <div className="flex items-center gap-2">
        <ListOrdered className="w-5 h-5 text-primary" />
        <h2 className="font-display text-xl">Tous les virements</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Annulez n'importe quel virement tant que l'émetteur ou le destinataire n'a pas fourni l'ensemble des documents de conformité.
        Les fonds déjà déplacés sont restitués et les deux parties reçoivent un e-mail expliquant la raison.
      </p>
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Montant</th>
              <th className="text-left px-3 py-2">Destinataire</th>
              <th className="text-left px-3 py-2">Statut</th>
              <th className="text-left px-3 py-2">Motif</th>
              <th className="text-right px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((t) => (
              <tr key={t.id} className="border-t border-border/40">
                <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString("fr-CA")}</td>
                <td className="px-3 py-2 font-medium">
                  {Number(t.amount).toLocaleString("fr-CA")} {t.currency}
                </td>
                <td className="px-3 py-2 text-xs">{t.recipient_identifier}</td>
                <td className="px-3 py-2">
                  <span className="text-[10px] uppercase tracking-widest border border-border px-2 py-0.5 rounded-full">
                    {t.status} · {t.progress}%
                  </span>
                </td>
                <td className="px-3 py-2 text-xs max-w-xs text-muted-foreground">{t.purpose ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isLocked(t)}
                    onClick={() => {
                      setTarget(t);
                      setReason("");
                    }}
                  >
                    <Ban className="w-3.5 h-3.5" />
                    {t.status === "cancelled" ? "Annulé" : "Annuler"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!rows || rows.length === 0) && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">Aucun virement enregistré.</div>
        )}
      </div>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuler le virement</DialogTitle>
            <DialogDescription>
              {target && (
                <>
                  {Number(target.amount).toLocaleString("fr-CA")} {target.currency} vers {target.recipient_identifier}. La raison sera
                  communiquée par e-mail au destinataire et à l'émetteur.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Raison de l'annulation</Label>
            <Input
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Documents de conformité non fournis dans les délais"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Retour
            </Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
              Confirmer l'annulation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}