
-- Helper: human-readable EDD tier label for a CAD amount
CREATE OR REPLACE FUNCTION public.edd_tier_label(_amount_cad numeric)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _amount_cad >= 50000000 THEN 'Palier EDD ≥ 50 000 000 CAD — conformité direction + régulateur'
    WHEN _amount_cad >= 25000000 THEN 'Palier EDD ≥ 25 000 000 CAD — comité conformité + banque correspondante'
    WHEN _amount_cad >= 10000000 THEN 'Palier EDD ≥ 10 000 000 CAD — audit, fiscal international, origine du patrimoine'
    WHEN _amount_cad >=  5000000 THEN 'Palier EDD ≥ 5 000 000 CAD — opinion juridique + EDD renforcé'
    WHEN _amount_cad >=  1000000 THEN 'Palier EDD ≥ 1 000 000 CAD — notarié, UBO, entretien conformité'
    WHEN _amount_cad >=   500000 THEN 'Palier EDD ≥ 500 000 CAD — fiscalité + relevés bancaires'
    WHEN _amount_cad >=   100000 THEN 'Palier EDD ≥ 100 000 CAD — domicile + origine des fonds'
    ELSE 'Vérification standard'
  END;
$$;

-- Refine start_transfer reason text with the precise EDD tier
CREATE OR REPLACE FUNCTION public.start_transfer(_from_wallet uuid, _recipient text, _amount numeric, _reference text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_w public.wallets; v_id uuid; v_rec_user uuid; v_rec_wallet uuid; v_tag text;
  v_amount_cad numeric; v_required jsonb; v_rec_total numeric; v_rec_tier card_tier;
  v_rec_kyc text; v_block_reason text;
  v_rec_status text := 'ok'; v_rec_progress smallint := 100;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  SELECT * INTO v_w FROM public.wallets WHERE id = _from_wallet AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Portefeuille introuvable'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;
  IF _amount > v_w.balance THEN RAISE EXCEPTION 'Solde insuffisant'; END IF;

  IF left(_recipient,1) = '@' THEN
    v_tag := lower(regexp_replace(substring(_recipient from 2), '[^a-z0-9]', '', 'gi'));
    SELECT p.id INTO v_rec_user FROM public.profiles p
      WHERE lower(regexp_replace(split_part(p.email,'@',1), '[^a-z0-9]', '', 'gi')) = v_tag LIMIT 1;
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
      v_block_reason := 'KYC destinataire non approuvé — vérification d''identité requise avant tout crédit.';
      v_rec_status := 'blocked'; v_rec_progress := 63;
    ELSIF jsonb_array_length(v_required) > 0 THEN
      v_block_reason := public.edd_tier_label(v_amount_cad)
        || ' · ' || jsonb_array_length(v_required)::text || ' document(s) à fournir et valider par la conformité Valtis.';
      v_rec_status := 'documents_required'; v_rec_progress := 63;
    ELSIF (v_rec_total + v_amount_cad) > 10000000 AND v_rec_tier <> 'gold_plus' THEN
      v_block_reason := 'Surclassement Gold Plus requis : le solde dépasserait 10 000 000 CAD.';
      v_rec_status := 'tier_upgrade_required'; v_rec_progress := 63;
    ELSIF (v_rec_total + v_amount_cad) > 50000 AND v_rec_tier = 'standard' THEN
      v_block_reason := 'Surclassement Gold requis : carte standard plafonnée à 50 000 CAD.';
      v_rec_status := 'tier_upgrade_required'; v_rec_progress := 63;
    END IF;
  END IF;

  INSERT INTO public.transfers(
    sender_id,from_wallet_id,recipient_identifier,recipient_user_id,recipient_wallet_id,
    amount,currency,reference,status,progress,current_step,
    recipient_progress,recipient_status,recipient_block_reason,required_documents,recipient_current_step
  ) VALUES (
    auth.uid(),_from_wallet,_recipient,v_rec_user,v_rec_wallet,
    _amount,v_w.currency,_reference,'verifying',0,'auth',
    CASE WHEN v_rec_user IS NULL THEN 0 ELSE v_rec_progress END,
    CASE WHEN v_rec_user IS NULL THEN 'pending' ELSE v_rec_status END,
    v_block_reason, v_required, 'auth'
  ) RETURNING id INTO v_id;

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

-- Submit: reject incomplete dossier, keep progress at 63 until admin validates
CREATE OR REPLACE FUNCTION public.recipient_submit_documents(_transfer_id uuid, _documents jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_t public.transfers; v_admin uuid;
  v_required_codes text[]; v_submitted_codes text[]; v_missing text[];
BEGIN
  SELECT * INTO v_t FROM public.transfers WHERE id = _transfer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfert introuvable'; END IF;
  IF v_t.recipient_user_id <> auth.uid() THEN RAISE EXCEPTION 'Accès refusé'; END IF;

  SELECT array_agg(d->>'code') INTO v_required_codes
    FROM jsonb_array_elements(COALESCE(v_t.required_documents,'[]'::jsonb)) d;

  SELECT array_agg(d->>'code') INTO v_submitted_codes
    FROM jsonb_array_elements(COALESCE(_documents,'[]'::jsonb)) d
    WHERE length(COALESCE(d->>'reference','')) > 2;

  SELECT array_agg(c) INTO v_missing
    FROM unnest(COALESCE(v_required_codes,'{}')) c
    WHERE c <> ALL (COALESCE(v_submitted_codes,'{}'));

  IF array_length(v_missing,1) > 0 THEN
    RAISE EXCEPTION 'Dossier incomplet : % document(s) manquant(s).', array_length(v_missing,1);
  END IF;

  UPDATE public.transfers
    SET submitted_documents = COALESCE(_documents,'[]'::jsonb),
        recipient_status = 'documents_review',
        recipient_progress = 63,
        recipient_block_reason = 'Dossier complet reçu — en attente de validation manuelle par la conformité Valtis (blocage maintenu à 63%).'
    WHERE id = _transfer_id;

  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES (auth.uid(),'transfer.recipient_docs_submitted','transfer',_transfer_id,
          jsonb_build_object('documents',_documents));

  FOR v_admin IN SELECT user_id FROM public.user_roles WHERE role='admin' LOOP
    PERFORM public.notify_user(v_admin,'transfer.recipient_docs_submitted',
      'Documents conformité reçus',
      'Un destinataire a soumis un dossier complet à valider.',
      jsonb_build_object('transfer_id',_transfer_id));
  END LOOP;
END; $function$;
