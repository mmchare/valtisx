import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldAlert, FileCheck2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

type Row = {
  id: string;
  amount: number;
  currency: string;
  recipient_progress: number;
  recipient_status: string;
  recipient_block_reason: string | null;
  required_documents: { code: string; label: string }[];
  submitted_documents: { code: string; reference: string }[];
  recipient_user_id: string | null;
  sender_id: string;
  created_at: string;
};

export function AdminRecipientBlocks() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: rows } = useQuery({
    queryKey: ["admin-recipient-blocks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfers")
        .select("id, amount, currency, recipient_progress, recipient_status, recipient_block_reason, required_documents, submitted_documents, recipient_user_id, sender_id, created_at")
        .in("recipient_status", ["blocked", "documents_required", "documents_review", "tier_upgrade_required"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
    refetchInterval: 10000,
  });

  async function clearBlock(id: string) {
    setBusy(id);
    const { error } = await supabase.rpc("admin_clear_recipient_block" as never, { _transfer_id: id } as never);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Blocage destinataire levé");
    qc.invalidateQueries({ queryKey: ["admin-recipient-blocks"] });
  }

  return (
    <section className="space-y-3 pt-4 border-t border-border/40">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-5 h-5 text-amber-500" />
        <h2 className="font-display text-xl">Blocages destinataire</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Transferts entrants bloqués à 63% côté destinataire : KYC, documents AML/EDD pour montants élevés (≥ 100k, 500k, 1M, 5M), ou surclassement de carte requis.
      </p>
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Montant</th>
              <th className="text-left px-3 py-2">Statut</th>
              <th className="text-left px-3 py-2">Raison</th>
              <th className="text-left px-3 py-2">Documents</th>
              <th className="text-right px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="border-t border-border/40">
                <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("fr-CA")}</td>
                <td className="px-3 py-2 font-medium">{Number(r.amount).toLocaleString("fr-CA")} {r.currency}</td>
                <td className="px-3 py-2">
                  <span className="text-[10px] uppercase tracking-widest border border-amber-500/40 text-amber-600 px-2 py-0.5 rounded-full">
                    {r.recipient_status} · {r.recipient_progress}%
                  </span>
                </td>
                <td className="px-3 py-2 text-xs max-w-xs">{r.recipient_block_reason ?? "—"}</td>
                <td className="px-3 py-2 text-xs">
                  {Array.isArray(r.required_documents) && r.required_documents.length > 0 ? (
                    <div className="space-y-0.5">
                      {r.required_documents.map((d) => {
                        const sub = (r.submitted_documents ?? []).find((s) => s.code === d.code);
                        return (
                          <div key={d.code} className="flex items-center gap-1.5">
                            <FileCheck2 className={`w-3 h-3 ${sub ? "text-emerald-500" : "text-muted-foreground"}`} />
                            <span>{d.label}{sub ? ` · ${sub.reference}` : ""}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="gold" onClick={() => clearBlock(r.id)} disabled={busy === r.id}>
                    {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    Lever le blocage
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!rows || rows.length === 0) && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">Aucun blocage destinataire en attente.</div>
        )}
      </div>
    </section>
  );
}