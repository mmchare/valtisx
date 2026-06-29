
-- Update Gold card ceiling to 10,000,000 CAD and extend EDD document tiers for very large amounts
CREATE OR REPLACE FUNCTION public.compute_required_documents(_amount_cad numeric)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE v jsonb := '[]'::jsonb;
BEGIN
  IF _amount_cad >= 100000 THEN
    v := v || jsonb_build_array(
      jsonb_build_object('code','proof_of_address','label','Justificatif de domicile (< 3 mois)'),
      jsonb_build_object('code','source_of_funds','label','Déclaration d''origine des fonds')
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
      jsonb_build_object('code','notarized_sof','label','Déclaration notariée d''origine des fonds'),
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
      jsonb_build_object('code','wealth_origin','label','Dossier complet d''origine du patrimoine (chronologie + pièces)'),
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

-- Update start_transfer: Gold cap now 10,000,000 CAD (instead of 500,000)
CREATE OR REPLACE FUNCTION public.start_transfer(_from_wallet uuid, _recipient text, _amount numeric, _reference text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_w public.wallets;
  v_id uuid;
  v_rec_user uuid;
  v_rec_wallet uuid;
  v_tag text;
  v_amount_cad numeric;
  v_required jsonb;
  v_rec_total numeric;
  v_rec_tier card_tier;
  v_rec_kyc text;
  v_block_reason text;
  v_rec_status text := 'ok';
  v_rec_progress smallint := 100;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  SELECT * INTO v_w FROM public.wallets WHERE id = _from_wallet AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Portefeuille introuvable'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;
  IF _amount > v_w.balance THEN RAISE EXCEPTION 'Solde insuffisant'; END IF;

  IF left(_recipient,1) = '@' THEN
    v_tag := lower(regexp_replace(substring(_recipient from 2), '[^a-z0-9]', '', 'gi'));
    SELECT p.id INTO v_rec_user FROM public.profiles p
      WHERE lower(regexp_replace(split_part(p.email,'@',1), '[^a-z0-9]', '', 'gi')) = v_tag
      LIMIT 1;
    IF v_rec_user IS NOT NULL THEN
      SELECT id INTO v_rec_wallet FROM public.wallets
        WHERE user_id = v_rec_user AND currency = v_w.currency
        ORDER BY is_primary DESC LIMIT 1;
    END IF;
  END IF;

  v_amount_cad := _amount * CASE v_w.currency WHEN 'CAD' THEN 1 WHEN 'EUR' THEN 1.48 WHEN 'USD' THEN 1.36 ELSE 1 END;
  v_required := public.compute_required_documents(v_amount_cad);

  IF v_rec_user IS NOT NULL THEN
    SELECT kyc_status::text INTO v_rec_kyc FROM public.profiles WHERE id = v_rec_user;
    SELECT tier INTO v_rec_tier FROM public.cards WHERE user_id = v_rec_user ORDER BY created_at ASC LIMIT 1;
    v_rec_total := public.user_total_cad(v_rec_user);

    IF v_rec_kyc <> 'approved' THEN
      v_block_reason := 'KYC destinataire non approuvé'; v_rec_status := 'blocked'; v_rec_progress := 63;
    ELSIF jsonb_array_length(v_required) > 0 THEN
      v_block_reason := 'Documents de conformité requis pour ce montant (' || round(v_amount_cad)::text || ' CAD éq.)';
      v_rec_status := 'documents_required'; v_rec_progress := 63;
    ELSIF (v_rec_total + v_amount_cad) > 10000000 AND v_rec_tier <> 'gold_plus' THEN
      v_block_reason := 'Surclassement Gold Plus requis : le solde dépasserait 10 000 000 CAD';
      v_rec_status := 'tier_upgrade_required'; v_rec_progress := 63;
    ELSIF (v_rec_total + v_amount_cad) > 50000 AND v_rec_tier = 'standard' THEN
      v_block_reason := 'Surclassement Gold requis : carte standard plafonnée à 50 000 CAD';
      v_rec_status := 'tier_upgrade_required'; v_rec_progress := 63;
    END IF;
  END IF;

  INSERT INTO public.transfers(
    sender_id,from_wallet_id,recipient_identifier,recipient_user_id,recipient_wallet_id,
    amount,currency,reference,status,progress,current_step,
    recipient_progress,recipient_status,recipient_block_reason,required_documents,recipient_current_step
  )
  VALUES (
    auth.uid(),_from_wallet,_recipient,v_rec_user,v_rec_wallet,
    _amount,v_w.currency,_reference,'verifying',0,'auth',
    CASE WHEN v_rec_user IS NULL THEN 0 ELSE v_rec_progress END,
    CASE WHEN v_rec_user IS NULL THEN 'pending' ELSE v_rec_status END,
    v_block_reason, v_required, 'auth'
  )
  RETURNING id INTO v_id;

  PERFORM public.notify_user(auth.uid(),'transfer.started','Transfert lancé',
    'Vérification conformité en cours pour ' || _amount::text || ' ' || v_w.currency || ' vers ' || _recipient,
    jsonb_build_object('transfer_id',v_id));

  IF v_rec_user IS NOT NULL THEN
    IF v_rec_status = 'ok' THEN
      PERFORM public.notify_user(v_rec_user,'transfer.incoming','Transfert entrant en vérification',
        'Un transfert de ' || _amount::text || ' ' || v_w.currency || ' est en cours.',
        jsonb_build_object('transfer_id',v_id));
    ELSE
      PERFORM public.notify_user(v_rec_user,'transfer.incoming_blocked','Action requise — transfert entrant bloqué (63%)',
        COALESCE(v_block_reason,'Conformité requise'),
        jsonb_build_object('transfer_id',v_id,'required_documents',v_required));
    END IF;
  END IF;

  RETURN v_id;
END; $function$;

-- Update admin_set_card_tier: Gold Plus minimum aligns with new Gold ceiling
CREATE OR REPLACE FUNCTION public.admin_set_card_tier(_card_id uuid, _tier card_tier)
RETURNS cards
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_card public.cards;
  v_total NUMERIC;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès refusé : rôle administrateur requis';
  END IF;

  SELECT * INTO v_card FROM public.cards WHERE id = _card_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Carte introuvable'; END IF;

  IF _tier = 'gold_plus' THEN
    v_total := public.user_total_cad(v_card.user_id);
    IF v_total < 10000000 THEN
      RAISE EXCEPTION 'Solde insuffisant pour Gold Plus (minimum 10 000 000 CAD, actuel : %)', round(v_total, 2);
    END IF;
  END IF;

  UPDATE public.cards SET tier = _tier WHERE id = _card_id RETURNING * INTO v_card;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'card.tier_changed', 'card', _card_id, jsonb_build_object('new_tier', _tier, 'user_id', v_card.user_id));

  RETURN v_card;
END;
$function$;
