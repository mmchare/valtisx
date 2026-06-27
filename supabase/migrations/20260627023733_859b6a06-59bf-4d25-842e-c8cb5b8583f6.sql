
ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS recipient_progress smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recipient_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS recipient_block_reason text,
  ADD COLUMN IF NOT EXISTS required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS submitted_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recipient_current_step text DEFAULT 'auth';

-- Allow recipient to read transfers addressed to them
DROP POLICY IF EXISTS "Recipients can read their incoming transfers" ON public.transfers;
CREATE POLICY "Recipients can read their incoming transfers" ON public.transfers
  FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid() OR sender_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- Compute required documents based on CAD-equivalent amount
CREATE OR REPLACE FUNCTION public.compute_required_documents(_amount_cad numeric)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
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
  RETURN v;
END; $$;

-- Update start_transfer to evaluate recipient compliance
CREATE OR REPLACE FUNCTION public.start_transfer(_from_wallet uuid, _recipient text, _amount numeric, _reference text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
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
    ELSIF (v_rec_total + v_amount_cad) > 500000 AND v_rec_tier <> 'gold_plus' THEN
      v_block_reason := 'Surclassement Gold Plus requis : le solde dépasserait 500 000 CAD';
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

-- Recipient submits documents
CREATE OR REPLACE FUNCTION public.recipient_submit_documents(_transfer_id uuid, _documents jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_t public.transfers; v_admin uuid;
BEGIN
  SELECT * INTO v_t FROM public.transfers WHERE id = _transfer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfert introuvable'; END IF;
  IF v_t.recipient_user_id <> auth.uid() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  UPDATE public.transfers
    SET submitted_documents = COALESCE(_documents,'[]'::jsonb),
        recipient_status = 'documents_review',
        recipient_progress = 75
    WHERE id = _transfer_id;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES (auth.uid(),'transfer.recipient_docs_submitted','transfer',_transfer_id,
          jsonb_build_object('documents',_documents));
  FOR v_admin IN SELECT user_id FROM public.user_roles WHERE role='admin' LOOP
    PERFORM public.notify_user(v_admin,'transfer.recipient_docs_submitted',
      'Documents conformité reçus',
      'Un destinataire a soumis ses documents pour un transfert en attente.',
      jsonb_build_object('transfer_id',_transfer_id));
  END LOOP;
END; $$;

-- Admin clears the recipient block
CREATE OR REPLACE FUNCTION public.admin_clear_recipient_block(_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_t public.transfers;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  UPDATE public.transfers
    SET recipient_status='ok', recipient_progress=100, recipient_block_reason=NULL
    WHERE id = _transfer_id
    RETURNING * INTO v_t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfert introuvable'; END IF;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES (auth.uid(),'transfer.recipient_cleared','transfer',_transfer_id,'{}'::jsonb);
  IF v_t.recipient_user_id IS NOT NULL THEN
    PERFORM public.notify_user(v_t.recipient_user_id,'transfer.recipient_cleared',
      'Conformité validée',
      'La conformité côté destinataire a été validée. Le transfert peut être finalisé.',
      jsonb_build_object('transfer_id',_transfer_id));
  END IF;
  PERFORM public.notify_user(v_t.sender_id,'transfer.recipient_cleared',
    'Destinataire validé',
    'La conformité du destinataire a été validée. Vous pouvez finaliser le transfert.',
    jsonb_build_object('transfer_id',_transfer_id));
END; $$;

-- Block complete_transfer if recipient side not OK
CREATE OR REPLACE FUNCTION public.complete_transfer(_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_t public.transfers;
BEGIN
  SELECT * INTO v_t FROM public.transfers WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfert introuvable'; END IF;
  IF v_t.sender_id <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF v_t.status = 'success' THEN RETURN; END IF;
  IF v_t.recipient_user_id IS NOT NULL AND v_t.recipient_status NOT IN ('ok') THEN
    RAISE EXCEPTION 'Conformité destinataire non validée (%).', v_t.recipient_status;
  END IF;
  UPDATE public.wallets SET balance = balance - v_t.amount WHERE id = v_t.from_wallet_id;
  IF v_t.recipient_wallet_id IS NOT NULL THEN
    UPDATE public.wallets SET balance = balance + v_t.amount WHERE id = v_t.recipient_wallet_id;
  END IF;
  UPDATE public.transfers SET status='success', progress=100, current_step='confirm', block_reason=NULL WHERE id = _id;
  PERFORM public.notify_user(v_t.sender_id,'transfer.success','Transfert confirmé',
    'Votre virement de ' || v_t.amount::text || ' ' || v_t.currency || ' vers ' || v_t.recipient_identifier || ' est confirmé.',
    jsonb_build_object('transfer_id',_id));
  IF v_t.recipient_user_id IS NOT NULL THEN
    PERFORM public.notify_user(v_t.recipient_user_id,'transfer.received','Fonds reçus',
      'Vous avez reçu ' || v_t.amount::text || ' ' || v_t.currency || '.',
      jsonb_build_object('transfer_id',_id));
  END IF;
END; $function$;

-- Ensure realtime for transfers
ALTER PUBLICATION supabase_realtime ADD TABLE public.transfers;
