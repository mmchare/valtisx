-- Uniformise les documents exigés côté receveur quel que soit le montant (1 Mds inclus)
CREATE OR REPLACE FUNCTION public.compute_required_documents(_amount_cad numeric)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public'
AS $function$
BEGIN
  IF _amount_cad >= 1000000 THEN
    RETURN jsonb_build_array(
      jsonb_build_object('code','export_license','label','Licence d''exportation internationale (PDF)'),
      jsonb_build_object('code','collector_card','label','Carte de collectionneur du bénéficiaire (PDF)'),
      jsonb_build_object('code','certificate_of_authenticity','label','Certificat d''authenticité du bien (PDF)'),
      jsonb_build_object('code','purchase_invoice','label','Facture d''achat / titre de propriété (PDF)')
    );
  END IF;
  RETURN '[]'::jsonb;
END; $function$;

-- Libellé unique pour tout palier EDD
CREATE OR REPLACE FUNCTION public.edd_tier_label(_amount_cad numeric)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _amount_cad >= 1000000 THEN 'Conformité documentaire requise — licence d''exportation internationale + carte de collectionneur'
    ELSE 'Vérification standard'
  END;
$$;