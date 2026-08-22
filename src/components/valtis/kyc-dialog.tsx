import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Upload } from "lucide-react";
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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const [fullName, setFullName] = useState(defaultName ?? "");
  const [country, setCountry] = useState("CA");
  const [docType, setDocType] = useState("passport");
  const [docNumber, setDocNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !docNumber.trim()) {
      return toast.error(t("nom_document_requis"));
    }
    if (!file) {
      return toast.error(t("piece_identite_requise"));
    }
    if (file.size > 8 * 1024 * 1024) {
      return toast.error(t("fichier_trop_lourd"));
    }
    setSubmitting(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setSubmitting(false); return toast.error(t("session_expiree")); }
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = `${uid}/kyc-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("kyc-documents").upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (up.error) { setSubmitting(false); return toast.error(up.error.message); }
    const { error } = await supabase.rpc("submit_kyc" as never, {
      _full_name: fullName.trim(),
      _country: country,
      _doc_type: docType,
      _doc_number: docNumber.trim(),
      _doc_url: path,
    } as never);
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(t("dossier_kyc_soumis"), {
      description: t("administrateur_validera_dossier"),
    });
    qc.invalidateQueries({ queryKey: ["profile"] });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" /> {t("verification_kyc")}
          </DialogTitle>
          <DialogDescription>
            {t("soumettez_vos_informations_pour_activer")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="kyc-name">{t("nom_legal_complet")}</Label>
            <Input
              id="kyc-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t("prenom_nom")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("pays")}</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CA">Canada</SelectItem>
                  <SelectItem value="FR">{t("france")}</SelectItem>
                  <SelectItem value="US">{t("etats-unis")}</SelectItem>
                  <SelectItem value="CH">{t("suisse")}</SelectItem>
                  <SelectItem value="BE">{t("belgique")}</SelectItem>
                  <SelectItem value="LU">{t("luxembourg")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("type_de_document")}</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="passport">{t("passeport")}</SelectItem>
                  <SelectItem value="id_card">{t("carte_didentite")}</SelectItem>
                  <SelectItem value="driver_license">{t("permis_de_conduire")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="kyc-doc">{t("numero_du_document")}</Label>
            <Input
              id="kyc-doc"
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              placeholder={t("ex_ab1234567")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kyc-file" className="flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" /> {t("piece_didentite_photo_ou_scan")}
            </Label>
            <Input
              id="kyc-file"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="text-[11px] text-muted-foreground">
                {file.name} · {(file.size / 1024).toFixed(0)} Ko
              </p>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("en_soumettant_ce_dossier_vous")}
          </p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("annuler")}
            </Button>
            <Button type="submit" variant="gold" disabled={submitting}>
              {submitting ? t("envoi") : t("soumettre")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}