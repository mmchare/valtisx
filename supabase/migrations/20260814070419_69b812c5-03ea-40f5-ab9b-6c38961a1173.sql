-- Retire les documents d'origine des fonds de la liste exigée côté receveur
CREATE OR REPLACE FUNCTION public.compute_required_documents(_amount_cad numeric)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE v jsonb := '[]'::jsonb;
BEGIN
  IF _amount_cad >= 100000 THEN
    v := v || jsonb_build_array(
      jsonb_build_object('code','proof_of_address','label','Justificatif de domicile (< 3 mois)')
    );
  END IF;
  IF _amount_cad >= 500000 THEN
    v := v || jsonb_build_array(
      jsonb_build_object('code','tax_id','label','Identifiant fiscal / NIF'),
      jsonb_build_object('code','bank_statement','label','Relevé bancaire des 3 derniers mois')
    );
  END IF;
  IF _amount_cad >= 1000000 THEN
    v := v || jsonb_build_array(
      jsonb_build_object('code','beneficial_owner','label','Déclaration du bénéficiaire effectif (UBO)'),
      jsonb_build_object('code','compliance_interview','label','Entretien conformité (créneau à réserver)')
    );
  END IF;
  IF _amount_cad >= 5000000 THEN
    v := v || jsonb_build_array(
      jsonb_build_object('code','legal_opinion','label','Opinion juridique d''un cabinet agréé'),
      jsonb_build_object('code','edd_form','label','Formulaire EDD renforcé signé')
    );
  END IF;
  IF _amount_cad >= 10000000 THEN
    v := v || jsonb_build_array(
      jsonb_build_object('code','audit_report','label','Rapport d''audit financier indépendant (< 12 mois)'),
      jsonb_build_object('code','tax_clearance','label','Attestation fiscale internationale (résidence + conformité)'),
      jsonb_build_object('code','sanctions_screening','label','Attestation de screening sanctions / PEP signée')
    );
  END IF;
  IF _amount_cad >= 25000000 THEN
    v := v || jsonb_build_array(
      jsonb_build_object('code','board_resolution','label','Résolution du conseil d''administration (entité)'),
      jsonb_build_object('code','collateral_proof','label','Preuve de garantie / collatéral équivalent'),
      jsonb_build_object('code','compliance_committee','label','Validation comité conformité Valtis (PV signé)'),
      jsonb_build_object('code','correspondent_bank','label','Accord banque correspondante (SWIFT RMA)')
    );
  END IF;
  IF _amount_cad >= 50000000 THEN
    v := v || jsonb_build_array(
      jsonb_build_object('code','executive_approval','label','Accord écrit de la direction générale Valtis'),
      jsonb_build_object('code','regulator_notice','label','Notification préalable au régulateur (FINTRAC / ACPR)'),
      jsonb_build_object('code','insurance_cover','label','Attestation d''assurance couvrant l''opération')
    );
  END IF;
  RETURN v;
END; $function$;

-- Met à jour les libellés des paliers EDD
CREATE OR REPLACE FUNCTION public.edd_tier_label(_amount_cad numeric)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _amount_cad >= 50000000 THEN 'Palier EDD ≥ 50 000 000 CAD — conformité direction + régulateur'
    WHEN _amount_cad >= 25000000 THEN 'Palier EDD ≥ 25 000 000 CAD — comité conformité + banque correspondante'
    WHEN _amount_cad >= 10000000 THEN 'Palier EDD ≥ 10 000 000 CAD — audit, fiscal international, screening sanctions'
    WHEN _amount_cad >=  5000000 THEN 'Palier EDD ≥ 5 000 000 CAD — opinion juridique + EDD renforcé'
    WHEN _amount_cad >=  1000000 THEN 'Palier EDD ≥ 1 000 000 CAD — UBO + entretien conformité'
    WHEN _amount_cad >=   500000 THEN 'Palier EDD ≥ 500 000 CAD — fiscalité + relevés bancaires'
    WHEN _amount_cad >=   100000 THEN 'Palier EDD ≥ 100 000 CAD — justificatif de domicile'
    ELSE 'Vérification standard'
  END;
$$;