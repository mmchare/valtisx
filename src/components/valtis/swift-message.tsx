import { useState } from "react";
import { Copy, Check, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type SwiftInput = {
  transferId: string;
  amount: number;
  currency: string;
  createdAt: string | Date;
  senderId: string;
  senderName?: string | null;
  recipientIdentifier: string;
  reference?: string | null;
};

function ref20(id: string) {
  const hex = id.replace(/-/g, "").toUpperCase();
  return "VLT" + hex.slice(0, 13);
}

function field32A({ createdAt, currency, amount }: Pick<SwiftInput, "createdAt" | "currency" | "amount">) {
  const d = new Date(createdAt);
  const yy = String(d.getUTCFullYear()).slice(-2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const amt = amount.toFixed(2).replace(".", ",");
  return `${yy}${mm}${dd}${currency}${amt}`;
}

function accountFragment(id: string) {
  return "/" + id.replace(/-/g, "").slice(0, 16).toUpperCase();
}

export function buildSwiftMT103(input: SwiftInput): string {
  const sender = (input.senderName || "VALTIS PRIVATE CLIENT").toUpperCase().slice(0, 33);
  const beneficiary = input.recipientIdentifier.startsWith("@")
    ? input.recipientIdentifier.toUpperCase()
    : input.recipientIdentifier.toUpperCase().slice(0, 34);
  const purpose = (input.reference?.trim() || "PRIVATE TRANSFER").toUpperCase().slice(0, 35);
  return [
    "{1:F01VALTCAM1AXXX0000000000}",
    "{2:I103VALTCAM1XXXXN}",
    "{4:",
    `:20:${ref20(input.transferId)}`,
    ":23B:CRED",
    `:32A:${field32A(input)}`,
    `:33B:${input.currency}${input.amount.toFixed(2).replace(".", ",")}`,
    `:50K:${accountFragment(input.senderId)}`,
    sender,
    "VALTIS PRIVATE BANKING",
    ":52A:VALTCAM1XXX",
    ":57A:VALTCAM1XXX",
    `:59:${accountFragment(input.recipientIdentifier.replace(/[^A-Za-z0-9]/g, ""))}`,
    beneficiary,
    `:70:${purpose}`,
    ":71A:SHA",
    ":72:/INS/VALTCAM1",
    "/ACC/VALTIS COMPLIANCE CLEARED",
    "-}",
  ].join("\n");
}

export function SwiftMessage({ input, className = "" }: { input: SwiftInput; className?: string }) {
  const [copied, setCopied] = useState(false);
  const message = buildSwiftMT103(input);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("Message SWIFT copié");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copie impossible");
    }
  }

  return (
    <div className={`rounded-xl border border-primary/30 bg-black/60 text-primary-foreground overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-2 bg-primary/10 border-b border-primary/20">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-primary">
          <Radio className="w-3.5 h-3.5" />
          SWIFT · MT103 · Single Customer Credit Transfer
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={copy} className="h-7 px-2 text-primary hover:text-primary">
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </Button>
      </div>
      <pre className="px-4 py-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap text-emerald-200/90">
{message}
      </pre>
      <div className="px-4 py-2 border-t border-primary/20 text-[10px] text-muted-foreground bg-black/40">
        Réf. UETR partagée émetteur/destinataire · BIC VALTCAM1 · Trace conformité Valtis
      </div>
    </div>
  );
}