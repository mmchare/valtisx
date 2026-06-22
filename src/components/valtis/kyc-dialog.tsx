import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function KycDialog({
  open,
  onOpenChange,
  defaultName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultName?: string | null;
}) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(defaultName ?? "");
  const [country, setCountry] = useState("CA");
  const [docType, setDocType] = useState("passport");
  const [docNumber, setDocNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !docNumber.trim()) {
      return toast.error("Nom complet et numéro de document requis");
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("submit_kyc" as never, {
      _full_name: fullName.trim(),
      _country: country,
      _doc_type: docType,
      _doc_number: docNumber.trim(),
    } as never);
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Dossier KYC soumis", {
      description: "Un administrateur validera votre dossier sous peu.",
    });
    qc.invalidateQueries({ queryKey: ["profile"] });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" /> Vérification KYC
          </DialogTitle>
          <DialogDescription>
            Soumettez vos informations pour activer votre carte standard et lever
            les restrictions sur vos virements.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="kyc-name">Nom légal complet</Label>
            <Input
              id="kyc-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Prénom Nom"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Pays</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CA">Canada</SelectItem>
                  <SelectItem value="FR">France</SelectItem>
                  <SelectItem value="US">États-Unis</SelectItem>
                  <SelectItem value="CH">Suisse</SelectItem>
                  <SelectItem value="BE">Belgique</SelectItem>
                  <SelectItem value="LU">Luxembourg</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type de document</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="passport">Passeport</SelectItem>
                  <SelectItem value="id_card">Carte d'identité</SelectItem>
                  <SelectItem value="driver_license">Permis de conduire</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="kyc-doc">Numéro du document</Label>
            <Input
              id="kyc-doc"
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              placeholder="ex. AB1234567"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            En soumettant ce dossier, vous autorisez Valtis à transmettre ces
            informations à sa cellule conformité aux fins de vérification.
          </p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="gold" disabled={submitting}>
              {submitting ? "Envoi…" : "Soumettre"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}